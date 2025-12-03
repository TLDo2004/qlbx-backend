import express from 'express';
import mongoose from 'mongoose';
import { RfidEtc, Transaction, TransactionSource, TransactionType, Vehicle } from '../../models';
import { internalError } from '../../utils';

const transactionRouter = express.Router();

const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

const normalizeObjectId = (
    value: string | mongoose.Types.ObjectId | mongoose.Schema.Types.ObjectId
): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(value.toString());

const validateEnumValue = <T extends Record<string, string>>(value: any, enumObj: T) =>
    Object.values(enumObj).includes(value);

const normalizeNote = (value: any) => {
    if (value === undefined || value === null) {
        return undefined;
    }

    const text = String(value).trim();
    return text.length ? text : undefined;
};

// helper apply transaction effect to rfid_etc
const applyTransactionEffect = async (
    rfidEtcId: mongoose.Types.ObjectId,
    type: TransactionType,
    amount: number,
    direction: 'apply' | 'revert'
) => {
    const rfidEtc = await RfidEtc.findById(rfidEtcId);
    if (!rfidEtc) {
        throw new Error('RFID_ETC_NOT_FOUND');
    }

    const factor = direction === 'apply' ? 1 : -1;

    // TOPUP and REFUND increase balance, DEBIT decreases balance
    // ADJUSTMENT can be positive (increase) or negative (decrease) based on amount sign
    if (type === TransactionType.TOPUP || type === TransactionType.REFUND) {
        rfidEtc.balance += factor * amount;
    } else if (type === TransactionType.DEBIT) {
        rfidEtc.balance -= factor * amount;
    } else if (type === TransactionType.ADJUSTMENT) {
        // ADJUSTMENT: amount can be positive or negative
        rfidEtc.balance += factor * amount;
    }

    if (rfidEtc.balance < 0) {
        throw new Error('INSUFFICIENT_BALANCE');
    }

    await rfidEtc.save();
    return rfidEtc;
};

// GET /transaction - list all transactions
transactionRouter.get('/', async (_req, res) => {
    try {
        const transactions = await Transaction.find()
            .populate('rfid_etc_id')
            .populate('perform_by')
            .populate('related_fee_record_id')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        internalError(res, 'Không thể lấy danh sách giao dịch');
    }
});

// GET /transaction/:id - get transaction by id
transactionRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const transaction = await Transaction.findById(id)
            .populate('rfid_etc_id')
            .populate('perform_by')
            .populate('related_fee_record_id');

        if (!transaction) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch'
            });
            return;
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        console.error('Error fetching transaction:', error);
        internalError(res, 'Không thể lấy thông tin giao dịch');
    }
});

// POST /transaction - create transaction
transactionRouter.post('/', async (req, res) => {
    try {
        const {
            rfid_etc_id,
            rfid_etc,
            license_plate,
            amount,
            type,
            source,
            related_fee_record_id,
            reference_code,
            perform_by,
            note
        } = req.body;

        if ((!rfid_etc_id && !rfid_etc && !license_plate) || amount === undefined || !type || !source) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: rfid_etc_id, rfid_etc hoặc license_plate, amount, type, source'
            });
            return;
        }

        if (rfid_etc_id && !isValidObjectId(rfid_etc_id)) {
            res.status(400).json({
                success: false,
                error: 'rfid_etc_id không hợp lệ'
            });
            return;
        }

        if (perform_by && !isValidObjectId(perform_by)) {
            res.status(400).json({
                success: false,
                error: 'perform_by không hợp lệ'
            });
            return;
        }

        if (related_fee_record_id && !isValidObjectId(related_fee_record_id)) {
            res.status(400).json({
                success: false,
                error: 'related_fee_record_id không hợp lệ'
            });
            return;
        }

        if (!validateEnumValue(type, TransactionType) || !validateEnumValue(source, TransactionSource)) {
            res.status(400).json({
                success: false,
                error: 'type hoặc source không hợp lệ'
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

        let resolvedRfidEtcId = rfid_etc_id;
        let rfidEtcDoc = null;

        if (resolvedRfidEtcId) {
            rfidEtcDoc = await RfidEtc.findById(resolvedRfidEtcId);
        } else if (rfid_etc) {
            const normalizedRfidEtc = String(rfid_etc).trim();
            if (!normalizedRfidEtc) {
                res.status(400).json({
                    success: false,
                    error: 'rfid_etc không được để trống'
                });
                return;
            }
            rfidEtcDoc = await RfidEtc.findOne({ rfid_etc: normalizedRfidEtc });
        } else if (license_plate) {
            const normalizedPlate = String(license_plate).trim().toUpperCase();

            if (!normalizedPlate) {
                res.status(400).json({
                    success: false,
                    error: 'license_plate không được để trống'
                });
                return;
            }

            const vehicle = await Vehicle.findOne({ license_plate: normalizedPlate });

            if (!vehicle) {
                res.status(404).json({
                    success: false,
                    error: 'Không tìm thấy phương tiện với license_plate đã cung cấp'
                });
                return;
            }

            if (!vehicle.rfid_etc) {
                res.status(404).json({
                    success: false,
                    error: 'Phương tiện này chưa có RFID/ETC'
                });
                return;
            }

            rfidEtcDoc = await RfidEtc.findOne({ rfid_etc: vehicle.rfid_etc });
        }

        if (!rfidEtcDoc) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy RFID/ETC'
            });
            return;
        }

        if (!rfidEtcDoc.is_active) {
            res.status(400).json({
                success: false,
                error: 'RFID/ETC đang bị khóa'
            });
            return;
        }

        resolvedRfidEtcId = rfidEtcDoc._id;
        const balance_before = rfidEtcDoc.balance;
        let balance_after = balance_before;

        // Calculate balance_after based on transaction type
        if (type === TransactionType.TOPUP || type === TransactionType.REFUND) {
            balance_after += amount;
        } else if (type === TransactionType.DEBIT) {
            if (amount > balance_before) {
                res.status(400).json({
                    success: false,
                    error: 'Số dư không đủ để trừ'
                });
                return;
            }
            balance_after -= amount;
        } else if (type === TransactionType.ADJUSTMENT) {
            // ADJUSTMENT: amount can be positive (increase) or negative (decrease)
            balance_after += amount;
            if (balance_after < 0) {
                res.status(400).json({
                    success: false,
                    error: 'Số dư không đủ sau điều chỉnh'
                });
                return;
            }
        }

        const normalizedNote = normalizeNote(note);

        const transactionData: any = {
            rfid_etc_id: resolvedRfidEtcId,
            amount,
            type,
            source,
            balance_before,
            balance_after
        };

        if (related_fee_record_id) {
            transactionData.related_fee_record_id = new mongoose.Types.ObjectId(related_fee_record_id);
        }
        if (reference_code) {
            transactionData.reference_code = reference_code;
        }
        if (perform_by) {
            transactionData.perform_by = new mongoose.Types.ObjectId(perform_by);
        }
        if (normalizedNote !== undefined) {
            transactionData.note = normalizedNote;
        }

        const transaction = await Transaction.create(transactionData);

        rfidEtcDoc.balance = balance_after;
        await rfidEtcDoc.save();

        const populated = await transaction.populate(['rfid_etc_id', 'perform_by', 'related_fee_record_id']);

        res.status(201).json({
            success: true,
            data: populated
        });
    } catch (error: any) {
        console.error('Error creating transaction:', error);

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'reference_code đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể tạo giao dịch');
    }
});

// PUT /transaction/:id - update transaction
transactionRouter.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const existing = await Transaction.findById(id);

        if (!existing) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch'
            });
            return;
        }

        const payload: any = {
            rfid_etc_id: req.body.rfid_etc_id ?? existing.rfid_etc_id,
            amount: req.body.amount ?? existing.amount,
            type: req.body.type ?? existing.type,
            source: req.body.source ?? existing.source,
            related_fee_record_id: req.body.related_fee_record_id !== undefined ? req.body.related_fee_record_id : existing.related_fee_record_id,
            reference_code: req.body.reference_code ?? existing.reference_code,
            perform_by: req.body.perform_by ?? existing.perform_by,
            note: existing.note
        };

        if (req.body.note !== undefined) {
            payload.note = normalizeNote(req.body.note);
        }

        if (!isValidObjectId(payload.rfid_etc_id.toString()) ||
            (payload.perform_by && !isValidObjectId(payload.perform_by.toString())) ||
            (payload.related_fee_record_id && !isValidObjectId(payload.related_fee_record_id.toString()))) {
            res.status(400).json({
                success: false,
                error: 'rfid_etc_id, perform_by hoặc related_fee_record_id không hợp lệ'
            });
            return;
        }

        if (!validateEnumValue(payload.type, TransactionType) ||
            !validateEnumValue(payload.source, TransactionSource)) {
            res.status(400).json({
                success: false,
                error: 'type hoặc source không hợp lệ'
            });
            return;
        }

        if (payload.amount < 0) {
            res.status(400).json({
                success: false,
                error: 'amount phải >= 0'
            });
            return;
        }

        const oldRfidEtcId = normalizeObjectId(existing.rfid_etc_id as any);
        const targetRfidEtcId = normalizeObjectId(payload.rfid_etc_id as any);

        // revert old effect
        const oldRfidEtc = await applyTransactionEffect(oldRfidEtcId, existing.type, existing.amount, 'revert');

        // if rfid_etc changed, use new rfid_etc; otherwise the revert already adjusted the same rfid_etc
        const targetRfidEtc = oldRfidEtcId.equals(targetRfidEtcId)
            ? oldRfidEtc
            : await RfidEtc.findById(targetRfidEtcId);

        if (!targetRfidEtc) {
            throw new Error('RFID_ETC_NOT_FOUND');
        }

        if (!targetRfidEtc.is_active) {
            res.status(400).json({
                success: false,
                error: 'Tài khoản đang bị khóa'
            });
            // re-apply old effect to keep data consistent
            await applyTransactionEffect(oldRfidEtcId, existing.type, existing.amount, 'apply');
            return;
        }

        const balance_before = targetRfidEtc.balance;
        let balance_after = balance_before;

        // Calculate balance_after based on transaction type
        if (payload.type === TransactionType.TOPUP || payload.type === TransactionType.REFUND) {
            balance_after += payload.amount;
        } else if (payload.type === TransactionType.DEBIT) {
            if (payload.amount > balance_before) {
                res.status(400).json({
                    success: false,
                    error: 'Số dư không đủ để trừ'
                });
                // re-apply old effect before returning
                await applyTransactionEffect(oldRfidEtcId, existing.type, existing.amount, 'apply');
                return;
            }
            balance_after -= payload.amount;
        } else if (payload.type === TransactionType.ADJUSTMENT) {
            // ADJUSTMENT: amount can be positive (increase) or negative (decrease)
            balance_after += payload.amount;
            if (balance_after < 0) {
                res.status(400).json({
                    success: false,
                    error: 'Số dư không đủ sau điều chỉnh'
                });
                // re-apply old effect before returning
                await applyTransactionEffect(oldRfidEtcId, existing.type, existing.amount, 'apply');
                return;
            }
        }

        targetRfidEtc.balance = balance_after;
        await targetRfidEtc.save();

        const updateData: any = {
            rfid_etc_id: targetRfidEtcId,
            amount: payload.amount,
            type: payload.type,
            source: payload.source,
            reference_code: payload.reference_code,
            perform_by: payload.perform_by,
            note: payload.note,
            balance_before,
            balance_after
        };

        if (payload.related_fee_record_id !== undefined) {
            updateData.related_fee_record_id = payload.related_fee_record_id 
                ? new mongoose.Types.ObjectId(payload.related_fee_record_id)
                : null;
        }

        const updated = await Transaction.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate(['rfid_etc_id', 'perform_by', 'related_fee_record_id']);

        res.json({
            success: true,
            data: updated
        });
    } catch (error: any) {
        console.error('Error updating transaction:', error);

        if (error.message === 'RFID_ETC_NOT_FOUND') {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy RFID/ETC'
            });
            return;
        }

        if (error.message === 'INSUFFICIENT_BALANCE') {
            res.status(400).json({
                success: false,
                error: 'Số dư không đủ'
            });
            return;
        }

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                error: 'reference_code đã tồn tại'
            });
            return;
        }

        internalError(res, 'Không thể cập nhật giao dịch');
    }
});

// DELETE /transaction/:id - delete transaction
transactionRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                error: 'ID không hợp lệ'
            });
            return;
        }

        const existing = await Transaction.findById(id);

        if (!existing) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch'
            });
            return;
        }

        await applyTransactionEffect(
            normalizeObjectId(existing.rfid_etc_id as any),
            existing.type,
            existing.amount,
            'revert'
        );
        await Transaction.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Xóa giao dịch thành công'
        });
    } catch (error: any) {
        console.error('Error deleting transaction:', error);

        if (error.message === 'RFID_ETC_NOT_FOUND') {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy RFID/ETC'
            });
            return;
        }

        if (error.message === 'INSUFFICIENT_BALANCE') {
            res.status(400).json({
                success: false,
                error: 'Không thể hoàn tác giao dịch do số dư âm'
            });
            return;
        }

        internalError(res, 'Không thể xóa giao dịch');
    }
});

export default transactionRouter;

