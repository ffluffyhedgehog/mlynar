import { Controller, Get } from '@nestjs/common';
import { K8sService } from '../run/k8s.service';

@Controller()
export class ApiController {
  constructor(private readonly k8sService: K8sService) {}

  @Get('data-kinds')
  getDataKinds() {
    return this.k8sService.dataKinds.map((kind) => ({
      name: kind.metadata.name,
      displayName: kind.spec.displayName,
    }));
  }

  @Get('operators')
  getOperators() {
    return this.k8sService.operators.map((op) => ({
      name: op.metadata.name,
    }));
  }
}
