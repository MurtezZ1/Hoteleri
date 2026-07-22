import { Module } from '@nestjs/common';
import { FrontDeskController } from './front-desk.controller';
import { FrontDeskService } from './front-desk.service';

@Module({
  controllers: [FrontDeskController],
  providers: [FrontDeskService],
})
export class FrontDeskModule {}
