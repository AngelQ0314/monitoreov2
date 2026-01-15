import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings } from './schemas/settings.schema';

@Injectable()
export class SettingsService {
  private readonly singletonId = 'global';
  constructor(@InjectModel(Settings.name) private settingsModel: Model<Settings>) {}

  async get(): Promise<Settings | null> {
    const s = await this.settingsModel.findOne({ _id: this.singletonId }).lean().exec();
    return s || null;
  }

  async upsert(data: Partial<Settings>) {
    const doc = await this.settingsModel.findOneAndUpdate({ _id: this.singletonId }, { $set: data }, { upsert: true, new: true }).exec();
    return doc;
  }
}
