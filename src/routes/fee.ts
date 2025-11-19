import express from 'express';
import mongoose from 'mongoose';
import { Fee } from '../models';
import { FeeType } from '../models/feeModel';
import { VehicleType } from '../models/vehicleModel';
import { internalError } from '../utils';

const feeRouter = express.Router();

const feeTypeSet = new Set(Object.values(FeeType));
const vehicleTypeSet = new Set(Object.values(VehicleType));

const normalizeEnumValue = <T extends string>(value: any, valueSet: Set<T>) => {
    if (value === undefined) {
        return { provided: false as const };
    }

    if (value === null) {
        return { provided: true as const, value: undefined };
    }

    const normalized = String(value).trim().toLowerCase() as T;

    if (!normalized) {
        return { provided: true as const, value: undefined };
    }

    if (!valueSet.has(normalized)) {
        return { provided: true as const, invalid: true as const };
    }

    return { provided: true as const, value: normalized };
};

const normalizeFeeType = (value: any) => normalizeEnumValue<FeeType>(value, feeTypeSet);
const normalizeVehicleType = (value: any) => normalizeEnumValue<VehicleType>(value, vehicleTypeSet);

// GET /fee - list all fees
feeRouter.get('/', async (req, res) => {
    try {
        const { fee_type: feeTypeQuery, vehicle_type: vehicleTypeQuery } = req.query;
        const filters: any = {};

        if (feeTypeQuery !== undefined) {
            const parsedFeeType = normalizeFeeType(feeTypeQuery);

            if (parsedFeeType.invalid || !parsedFeeType.value) {
                res.status(400).json({
                    success: false,
                    error: 'fee_type không hợp lệ'
                });
                return;
            }

            filters.fee_type = parsedFeeType.value;
        }

        if (vehicleTypeQuery !== undefined) {
            const parsedVehicleType = normalizeVehicleType(vehicleTypeQuery);

            if (parsedVehicleType.invalid) {
                res.status(400).json({
                    success: false,
                    error: 'vehicle_type không hợp lệ'
                });
                return;
            }

            filters.vehicle_type = parsedVehicleType.value ?? { $exists: false };
        }

        const fees = await Fee.find(filters).sort({ fee_type: 1, vehicle_type: 1 });
        res.json({
            success: true,
            data: fees
        });
    } catch (error) {
        console.error('Error fetching fees:', error);
        internalError(res, 'Không thể lấy danh sách phí');
    }
});

// GET /fee/:id - get fee by id
feeRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        let fee = null;

        if (mongoose.Types.ObjectId.isValid(id)) {
            fee = await Fee.findById(id);
        } else {
            const parsedFeeType = normalizeFeeType(id);

            if (parsedFeeType.invalid || !parsedFeeType.value) {
                res.status(400).json({
                    success: false,
                    error: 'ID hoặc fee_type không hợp lệ'
                });
                return;
            }

            const filters: any = { fee_type: parsedFeeType.value };

            if (req.query.vehicle_type !== undefined) {
                const parsedVehicleType = normalizeVehicleType(req.query.vehicle_type);

                if (parsedVehicleType.invalid) {
                    res.status(400).json({
                        success: false,
                        error: 'vehicle_type không hợp lệ'
                    });
                    return;
                }

                filters.vehicle_type = parsedVehicleType.value ?? { $exists: false };
            }

            fee = await Fee.findOne(filters);
        }

        if (!fee) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy biểu phí'
            });
            return;
        }

        res.json({
            success: true,
            data: fee
        });
    } catch (error) {
        console.error('Error fetching fee:', error);
        internalError(res, 'Không thể lấy thông tin biểu phí');
    }
});

// POST /fee - create new fee
feeRouter.post('/', async (req, res) => {
    try {
        const { fee_type, fee_name, vehicle_type, amount } = req.body;

        if (fee_type === undefined || !fee_name || amount === undefined) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: fee_type, fee_name, amount'
            });
            return;
        }

        const parsedFeeType = normalizeFeeType(fee_type);

        if (!parsedFeeType.value || parsedFeeType.invalid) {
            res.status(400).json({
                success: false,
                error: 'fee_type không hợp lệ'
            });
            return;
        }

        if (amount < 0) {
            res.status(400).json({
                success: false,
                error: 'amount phải >= 0'
            });
            return;
        }

        let vehicleTypeValue: VehicleType | undefined;

        if (vehicle_type !== undefined) {
            const parsedVehicleType = normalizeVehicleType(vehicle_type);

            if (parsedVehicleType.invalid) {
                res.status(400).json({
                    success: false,
                    error: 'vehicle_type không hợp lệ'
                });
                return;
            }

            vehicleTypeValue = parsedVehicleType.value;
        }

        const newFee = await Fee.create({
            fee_type: parsedFeeType.value,
            fee_name: String(fee_name).trim(),
            ...(vehicleTypeValue !== undefined ? { vehicle_type: vehicleTypeValue } : {}),
            amount
        });

        res.status(201).json({
            success: true,
            data: newFee
        });
    } catch (error: any) {
        console.error('Error creating fee:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Biểu phí cho loại phương tiện này đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể tạo biểu phí');
    }
});

// PUT /fee/:id - update fee
feeRouter.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const setPayload: any = {};
        const unsetPayload: any = {};

        if (req.body.fee_type !== undefined) {
            const parsedFeeType = normalizeFeeType(req.body.fee_type);

            if (parsedFeeType.invalid || !parsedFeeType.value) {
                res.status(400).json({
                    success: false,
                    error: 'fee_type không hợp lệ'
                });
                return;
            }

            setPayload.fee_type = parsedFeeType.value;
        }

        if (req.body.fee_name !== undefined) {
            const trimmedName = String(req.body.fee_name).trim();

            if (!trimmedName) {
                res.status(400).json({
                    success: false,
                    error: 'fee_name không được để trống'
                });
                return;
            }

            setPayload.fee_name = trimmedName;
        }

        if (req.body.amount !== undefined) {
            const parsedAmount = Number(req.body.amount);

            if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
                res.status(400).json({
                    success: false,
                    error: 'amount phải là số >= 0'
                });
                return;
            }

            setPayload.amount = parsedAmount;
        }

        if (req.body.vehicle_type !== undefined) {
            const parsedVehicleType = normalizeVehicleType(req.body.vehicle_type);

            if (parsedVehicleType.invalid) {
                res.status(400).json({
                    success: false,
                    error: 'vehicle_type không hợp lệ'
                });
                return;
            }

            if (parsedVehicleType.value) {
                setPayload.vehicle_type = parsedVehicleType.value;
            } else {
                unsetPayload.vehicle_type = '';
            }
        }

        if (!Object.keys(setPayload).length && !Object.keys(unsetPayload).length) {
            res.status(400).json({
                success: false,
                error: 'Không có dữ liệu để cập nhật'
            });
            return;
        }

        const updateOps: any = {};

        if (Object.keys(setPayload).length) {
            updateOps.$set = setPayload;
        }

        if (Object.keys(unsetPayload).length) {
            updateOps.$unset = unsetPayload;
        }

        const updatedFee = await Fee.findByIdAndUpdate(
            id,
            updateOps,
            { new: true, runValidators: true }
        );

        if (!updatedFee) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy biểu phí'
            });
            return;
        }

        res.json({
            success: true,
            data: updatedFee
        });
    } catch (error: any) {
        console.error('Error updating fee:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'Biểu phí cho loại phương tiện này đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể cập nhật biểu phí');
    }
});

// DELETE /fee/:id - delete fee
feeRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let deleted = null;

        if (mongoose.Types.ObjectId.isValid(id)) {
            deleted = await Fee.findByIdAndDelete(id);
        } else {
            const parsedFeeType = normalizeFeeType(id);

            if (parsedFeeType.invalid || !parsedFeeType.value) {
                res.status(400).json({
                    success: false,
                    error: 'ID hoặc fee_type không hợp lệ'
                });
                return;
            }

            const filters: any = { fee_type: parsedFeeType.value };

            if (req.query.vehicle_type !== undefined) {
                const parsedVehicleType = normalizeVehicleType(req.query.vehicle_type);

                if (parsedVehicleType.invalid) {
                    res.status(400).json({
                        success: false,
                        error: 'vehicle_type không hợp lệ'
                    });
                    return;
                }

                filters.vehicle_type = parsedVehicleType.value ?? { $exists: false };
            }

            deleted = await Fee.findOneAndDelete(filters);
        }

        if (!deleted) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy biểu phí'
            });
            return;
        }

        res.json({
            success: true,
            message: 'Xóa biểu phí thành công'
        });
    } catch (error) {
        console.error('Error deleting fee:', error);
        internalError(res, 'Không thể xóa biểu phí');
    }
});

export default feeRouter;


