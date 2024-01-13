import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FsService } from './fs.service';
import { K8sService } from './k8s.service';
import { DataUnit, Run, RunStatus, RunStepArgument } from './run.types';
import { cartesianProduct } from '../util/cartesian';
import { uniq } from '../util/uniq';
import { isSuperSet } from '../util/is-super-set';
import { Operator } from './k8s.types';
import { recordEqual } from '../util/record-equal';
import { DeepReadonly } from '../util/deep-freeze';

@Injectable()
export class RunService {
  private readonly logger = new Logger(RunService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly k8sService: K8sService,
    private readonly fsService: FsService,
  ) {}

  async run(runId: string) {
    while (true) {
      this.logger.debug(`Starting pass on run ${runId}`);

      const run = await this.fsService.getRun(runId);
      if (run.status === RunStatus.Terminated) {
        this.logger.debug(`Run ${runId} terminated.`);
        return;
      }

      const operators = this.getImmediatelyAvailableOperators(run);

      // Selects available DataKinds for each of the operator inputs
      const inputOptionsPerOperator = operators.map((op) =>
        this.selectOperatorInputs(op, run),
      );

      // filters out operators that don't have one or more of the inputs fulfilled by DataUnit
      const actuallyAvailableOperators = inputOptionsPerOperator.filter((op) =>
        Object.keys(op.inputOptions).every(
          (key) => op.inputOptions[key].length > 0,
        ),
      );
      // if no operators are available, break
      if (actuallyAvailableOperators.length === 0) {
        break;
      }

      // if your input options are [1, 2] for input1 and [a, b] for input2
      // make [{input1: 1, input2: a}, {input1: 1, input2: b}, {input1: 2, input2: a}, {input1: 2, input2: b}]
      const inputSetsPerAvailableOperator = actuallyAvailableOperators.map(
        (op) => ({
          operator: op.operator,
          parameterSets: cartesianProduct(op.inputOptions),
        }),
      );

      const stepInputs: RunStepArgument[] =
        inputSetsPerAvailableOperator.reduce(
          (acc, op) => {
            acc.push(
              ...op.parameterSets.map((inputs) => ({
                operator: op.operator,
                inputs,
              })),
            );
            return acc;
          },
          [] as { operator: Operator; inputs: Record<string, string> }[],
        );

      // in case a user is a dum-dum or they are doing something wicked that for example requires two inputs of same type
      // we need to filter out inputSets that have two inputs that are the same DataUnit
      // luckily, we're assholes, so we do it in an asshole way
      const honestStepInputs: RunStepArgument[] = stepInputs.filter((si) => {
        const inputIdsAsArray = Object.values(si.inputs);
        const inputIdsAsSet = new Set(inputIdsAsArray);
        return inputIdsAsSet.size === inputIdsAsArray.length;
      });

      if (honestStepInputs.length === 0) {
        break;
      }

      const cleanStepInputs = honestStepInputs.filter((stepInput) => {
        return !run.steps.find((step) =>
          recordEqual(stepInput.inputs, step.inputDataUnits),
        );
      });

      this.logger.debug(
        `Pass finished, ${cleanStepInputs.length} new steps to run`,
      );

      if (cleanStepInputs.length === 0) {
        break;
      }

      await Promise.all(
        cleanStepInputs.map((stepArg) => {
          return this.k8sService.runStep(run, stepArg);
        }),
      );
    }

    this.logger.debug(`Run ${runId} complete!`);

    await this.fsService.setRunStatus(runId, RunStatus.Complete);
  }

  getImmediatelyAvailableOperators(run: DeepReadonly<Run>) {
    const dataKinds = run.dataPool
      .map((dataUnit) => dataUnit.dataKind)
      .filter(uniq);

    return this.k8sService.operators.filter((operator) => {
      return isSuperSet(operator.spec.inputTypes, dataKinds);
    });
  }

  selectOperatorInputs(
    operator: Operator,
    run: DeepReadonly<Run>,
  ): { operator: Operator; inputOptions: Record<string, string[]> } {
    const availableDataUnits = run.dataPool.filter((unit) =>
      operator.spec.inputTypes.includes(unit.dataKind),
    );

    return {
      operator,
      inputOptions: operator.spec.inputs.reduce(
        (acc, input) => ({
          ...acc,
          [input.fileLocationEnv]: availableDataUnits
            .filter(
              (unit) =>
                unit.dataKind === input.dataKind &&
                !unit.ancestors.includes(
                  // this is hella important to not cause cycles
                  operator.metadata.name,
                ),
            )
            .map((unit) => unit.id),
        }),
        {},
      ),
    };
  }

  async getRecursiveAvailableOperators(dataUnits: DeepReadonly<DataUnit[]>) {
    const dataKinds = dataUnits.map((unit) => unit.dataKind).filter(uniq);
    let newOps: Operator[] = [];
    const operators: Operator[] = [];

    do {
      newOps = this.k8sService.operators.filter(
        (op) =>
          isSuperSet(op.spec.inputTypes, dataKinds) && !operators.includes(op),
      );
      operators.push(...newOps);
      dataKinds.push(
        ...newOps.reduce(
          (acc, op) => (acc.push(...op.spec.possibleOutputKinds), acc),
          [] as string[],
        ),
      );
      dataKinds.filter(uniq);
    } while (newOps.length > 0);

    return operators;
  }
}
