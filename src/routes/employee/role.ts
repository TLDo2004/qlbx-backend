import express from 'express';
import { Role } from '../../models/roleModel';
import { internalError } from '../../utils';

const roleRouter = express.Router();   

// GET /employee/role/list - Get all roles
roleRouter.get('/list', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const roles = await Role.find({});
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    internalError(res, 'Không thể lấy danh sách vai trò');
  }
});

export default roleRouter;