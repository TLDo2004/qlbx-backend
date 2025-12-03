import express from 'express';
import mongoose from 'mongoose';
import { FeeRule } from '../../models';
import { internalError } from '../../utils';

const feeRuleRouter = express.Router();

// GET /fee-rule - list fee rules (default: only active)
feeRuleRouter.get('/', async (req, res) => {
  try {
    const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
    const filter: any = {};

    if (!includeInactive) {
      filter.is_active = true;
    }

    const rules = await FeeRule.find(filter).sort({ min_seat: 1, max_seat: 1, name: 1 });

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error('Error fetching fee rules:', error);
    internalError(res, 'Không thể lấy danh sách biểu phí (fee_rule)');
  }
});

// POST /fee-rule - create new fee rule
feeRuleRouter.post('/', async (req, res) => {
  try {
    const { name, min_seat, max_seat, amount, is_active } = req.body;

    if (!name || amount === undefined) {
      res.status(400).json({
        success: false,
        error: 'Thiếu trường bắt buộc: name, amount',
      });
      return;
    }

    // Set defaults: min_seat = 0 if null, max_seat = 199 if null
    const parsedMinSeat = min_seat === null || min_seat === undefined ? 0 : Number(min_seat);
    const parsedMaxSeat = max_seat === null || max_seat === undefined ? 199 : Number(max_seat);
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedMinSeat) || parsedMinSeat < 0) {
      res.status(400).json({
        success: false,
        error: 'min_seat phải là số >= 0',
      });
      return;
    }

    if (!Number.isFinite(parsedMaxSeat) || parsedMaxSeat < 0) {
      res.status(400).json({
        success: false,
        error: 'max_seat phải là số >= 0',
      });
      return;
    }

    if (parsedMinSeat > parsedMaxSeat) {
      res.status(400).json({
        success: false,
        error: 'min_seat không được lớn hơn max_seat',
      });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({
        success: false,
        error: 'amount phải là số >= 0',
      });
      return;
    }

    const newRule = await FeeRule.create({
      name: String(name).trim(),
      min_seat: parsedMinSeat,
      max_seat: parsedMaxSeat,
      amount: parsedAmount,
      is_active: is_active !== undefined ? Boolean(is_active) : true,
    });

    res.status(201).json({
      success: true,
      data: newRule,
    });
  } catch (error: any) {
    console.error('Error creating fee rule:', error);

    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        error: 'Biểu phí với khoảng chỗ ngồi này đã tồn tại',
      });
      return;
    }

    internalError(res, 'Không thể tạo biểu phí (fee_rule)');
  }
});

// PUT /fee-rule/:id - update fee rule
feeRuleRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID không hợp lệ',
      });
      return;
    }

    const payload: any = {};

    if (req.body.name !== undefined) {
      const trimmedName = String(req.body.name).trim();
      if (!trimmedName) {
        res.status(400).json({
          success: false,
          error: 'name không được để trống',
        });
        return;
      }
      payload.name = trimmedName;
    }

    let parsedMinSeat: number | undefined;
    let parsedMaxSeat: number | undefined;

    if (req.body.min_seat !== undefined) {
      // If null, set to 0; otherwise parse the number
      if (req.body.min_seat === null) {
        parsedMinSeat = 0;
        payload.min_seat = 0;
      } else {
        parsedMinSeat = Number(req.body.min_seat);
        if (!Number.isFinite(parsedMinSeat) || parsedMinSeat < 0) {
          res.status(400).json({
            success: false,
            error: 'min_seat phải là số >= 0',
          });
          return;
        }
        payload.min_seat = parsedMinSeat;
      }
    }

    if (req.body.max_seat !== undefined) {
      // If null, set to 199; otherwise parse the number
      if (req.body.max_seat === null) {
        parsedMaxSeat = 199;
        payload.max_seat = 199;
      } else {
        parsedMaxSeat = Number(req.body.max_seat);
        if (!Number.isFinite(parsedMaxSeat) || parsedMaxSeat < 0) {
          res.status(400).json({
            success: false,
            error: 'max_seat phải là số >= 0',
          });
          return;
        }
        payload.max_seat = parsedMaxSeat;
      }
    }

    const finalMinSeat = parsedMinSeat ?? (req.body.min_seat !== undefined ? (req.body.min_seat === null ? 0 : Number(req.body.min_seat)) : undefined);
    const finalMaxSeat = parsedMaxSeat ?? (req.body.max_seat !== undefined ? (req.body.max_seat === null ? 199 : Number(req.body.max_seat)) : undefined);

    // Nếu cả hai đều có trong body (hoặc đã parse), kiểm tra quan hệ
    if (finalMinSeat !== undefined && finalMaxSeat !== undefined) {
      if (Number(finalMinSeat) > Number(finalMaxSeat)) {
        res.status(400).json({
          success: false,
          error: 'min_seat không được lớn hơn max_seat',
        });
        return;
      }
    }

    if (req.body.amount !== undefined) {
      const parsedAmount = Number(req.body.amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        res.status(400).json({
          success: false,
          error: 'amount phải là số >= 0',
        });
        return;
      }
      payload.amount = parsedAmount;
    }

    if (req.body.is_active !== undefined) {
      payload.is_active = Boolean(req.body.is_active);
    }

    if (!Object.keys(payload).length) {
      res.status(400).json({
        success: false,
        error: 'Không có dữ liệu để cập nhật',
      });
      return;
    }

    const updatedRule = await FeeRule.findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true });

    if (!updatedRule) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy biểu phí',
      });
      return;
    }

    res.json({
      success: true,
      data: updatedRule,
    });
  } catch (error: any) {
    console.error('Error updating fee rule:', error);

    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        error: 'Biểu phí với khoảng chỗ ngồi này đã tồn tại',
      });
      return;
    }

    internalError(res, 'Không thể cập nhật biểu phí (fee_rule)');
  }
});

// DELETE /fee-rule/:id - soft delete (set is_active = false)
feeRuleRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID không hợp lệ',
      });
      return;
    }

    const updatedRule = await FeeRule.findByIdAndUpdate(
      id,
      { $set: { is_active: false } },
      { new: true }
    );

    if (!updatedRule) {
      res.status(404).json({
        success: false,
        error: 'Không tìm thấy biểu phí',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Đã vô hiệu hóa biểu phí thành công',
      data: updatedRule,
    });
  } catch (error) {
    console.error('Error deleting fee rule:', error);
    internalError(res, 'Không thể vô hiệu hóa biểu phí (fee_rule)');
  }
});

export default feeRuleRouter;


