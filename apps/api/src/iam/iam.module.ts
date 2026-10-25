import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LoginAclController } from './login-acl.controller';
import { LoginAclService } from './login-acl.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ imports: [AuthModule], controllers: [UsersController, LoginAclController], providers: [UsersService, LoginAclService] })
export class IamModule {}
