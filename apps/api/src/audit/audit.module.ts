import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditedTransaction } from './audited-transaction';

@Global()
@Module({
  providers: [AuditService, AuditedTransaction],
  exports: [AuditService, AuditedTransaction],
})
export class AuditModule {}
