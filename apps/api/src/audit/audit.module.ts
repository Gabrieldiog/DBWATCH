import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditedTransaction } from './audited-transaction';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditedTransaction],
  exports: [AuditService, AuditedTransaction],
})
export class AuditModule {}
