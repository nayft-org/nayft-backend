import { Plan } from './plans.model';

export const planService = {
  async getAll() {
    return Plan.find({}).sort({ key: 1 }).lean().exec();
  },
};
