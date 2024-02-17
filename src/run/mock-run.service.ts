import { Injectable, Logger } from '@nestjs/common';
import { cartesianProduct } from '../util/cartesian';
import {
  DataUnit,
  Run,
  RunStatus,
  RunStepArgument,
  StepStatus,
} from './run.types';
import { DataKind, Operator } from './k8s.types';
import { recordEqual } from '../util/record-equal';
import { DeepReadonly } from '../util/deep-freeze';
import { uniq } from '../util/uniq';
import { isSuperSet } from '../util/is-super-set';
import * as crypto from 'crypto';

const randomString = () => crypto.randomBytes(16).toString('hex');
const pickRandomInputs = (dataKinds: DataKind[]) => {
  const starter = Math.random() > 0.5;
  return Array.from({ length: Math.ceil(Math.random() * 2) }, () => {
    return dataKinds[
      Math.floor(
        (Math.random() * dataKinds.length) / 3 +
          (starter ? 0 : dataKinds.length / 3),
      )
    ];
  }).map((kind) => ({
    fileLocationEnv: '',
    dataKind: kind.metadata.name,
  }));
};

function createMockedSpace() {
  const dataKinds: DataKind[] = Array.from({ length: 25 }, () => ({
    apiVersion: '',
    metadata: { name: randomString() } as any,
    spec: {
      displayName: '',
    },
    kind: '',
  }));
  const operators: Operator[] = Array.from({ length: 50 }, () => {
    const inputs = pickRandomInputs(dataKinds);
    return {
      metadata: { name: randomString() } as any,
      apiVersion: '',
      kind: '',
      spec: {
        configurableEnv: [],
        inputTypes: inputs.map((i) => i.dataKind),
        inputs: inputs,
        command: '',
        possibleOutputKinds: [],
        constantEnv: [],
        image: '',
      },
    };
  });
  const startingDataUnits: DataUnit[] = Array.from({ length: 3 }, () => ({
    id: randomString(),
    dataKind:
      dataKinds[Math.floor(Math.random() * dataKinds.length)].metadata.name,
    ancestors: [],
  }));
  const run: Run = {
    id: randomString(),
    steps: [],
    status: RunStatus.Created,
    dataPool: startingDataUnits,
    paramPool: {},
  };

  return { dataKinds, operators, startingDataUnits, run };
}

@Injectable()
export class MockRunService {
  private readonly logger = new Logger(MockRunService.name);
  dataKinds: DataKind[];
  operators: Operator[];

  constructor() {}

  async run() {
    const { dataKinds, operators, run } = createMockedSpace();
    this.dataKinds = dataKinds;
    this.operators = operators;
    const initialDU = run.dataPool.length;
    let passes = 0;
    const runstart = performance.now();
    while (true) {
      passes += 1;
      // this.logger.log(`Starting pass on mocked run`);

      const operators = this.getImmediatelyAvailableOperators(run);

      // this.logger.log(`Mocked run has ${operators.length} operators available`);

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

      // this.logger.log(
      //   `Mocked run has ${actuallyAvailableOperators.length} operators actually available`,
      // );
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

      // this.logger.log(
      //   `Mocked run has ${honestStepInputs.length} honest input options`,
      // );

      if (honestStepInputs.length === 0) {
        break;
      }

      const cleanStepInputs = honestStepInputs.filter((stepInput) => {
        return !run.steps.find((step) =>
          recordEqual(stepInput.inputs, step.inputDataUnits),
        );
      });

      // this.logger.log(
      //   `Pass finished, ${cleanStepInputs.length} new steps to run`,
      // );

      if (cleanStepInputs.length === 0) {
        break;
      }

      if (passes > 1000 || cleanStepInputs.length > 1000) {
        return {};
      }

      console.log(passes);

      run.steps.push(
        ...cleanStepInputs.map((input) => ({
          id: randomString(),
          inputDataUnits: input.inputs,
          operator: input.operator.metadata.name,
          jobName: '',
          outputDataUnits: [],
          status: StepStatus.Created,
          pvcName: '',
        })),
      );

      run.dataPool.push(
        ...Array.from(
          {
            length: Math.floor(Math.random() * (cleanStepInputs.length * 2)),
          },
          () => {
            const parent =
              cleanStepInputs[
                Math.floor(Math.random() * cleanStepInputs.length)
              ];
            const stepInputIds = new Set(Object.values(parent.inputs));

            const stepInputs = run.dataPool.filter((dataUnit) =>
              stepInputIds.has(dataUnit.id),
            );
            return {
              id: randomString(),
              dataKind:
                dataKinds[Math.floor(Math.random() * dataKinds.length)].metadata
                  .name,
              ancestors: [
                ...stepInputs
                  .reduce(
                    (acc, stepInput) => (acc.push(...stepInput.ancestors), acc),
                    [] as string[],
                  )
                  .filter(uniq),
                parent.operator.metadata.name,
              ],
            };
          },
        ),
      );
    }

    (run as any).time = performance.now() - runstart;
    (run as any).passes = passes;
    (run as any).stepsAmount = run.steps.length;
    (run as any).newDataUnits = run.dataPool.length - initialDU;

    this.logger.debug(`Run mocking complete!`);

    return {
      time: (run as any).time,
      passes: (run as any).passes,
      stepsAmount: (run as any).stepsAmount,
      newDataUnits: (run as any).newDataUnits,
    };
  }

  getImmediatelyAvailableOperators(run: DeepReadonly<Run>) {
    const dataKinds = run.dataPool
      .map((dataUnit) => dataUnit.dataKind)
      .filter(uniq);

    return this.operators.filter((operator) => {
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
}
