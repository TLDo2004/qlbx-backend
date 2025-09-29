import express from 'express';
import { Employee } from '../../models/Employee';
import { internalError } from '../../utils';

interface IEmployeeRequest extends express.Request {
  body: {
    fullName: string;
    phone: string;
    roleId: string;
  };
}

const employeeRouter = express.Router();

//POST /employee - Create a new employee    
employeeRouter.post('/', async (req: IEmployeeRequest, res: express.Response): Promise<void> => {
  try {
  const { fullName, phone, roleId } = req.body;
  const employee = await Employee.create({ fullName, phone, roleId });
  res.json(employee);
  } catch (error) {
    internalError(res, 'Failed to create employee');
  }
});

export default employeeRouter;