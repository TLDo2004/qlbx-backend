import express from 'express';
import mongoose from 'mongoose';
import { Account, Transaction, TransactionSource, TransactionType } from '../models';
import { internalError } from '../utils';

const transactionRouter = express.Router();

const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

const normalizeObjectId = (
    value: string | mongoose.Types.ObjectId | mongoose.Schema.Types.ObjectId
): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(value.toString());

const validateEnumValue = <T extends Record<string, string>>(value: any, enumObj: T) =>
    Object.values(enumObj).includes(value);

// helper apply transaction effect to account
const applyTransactionEffect = async (
    accountId: mongoose.Types.ObjectId,
    type: TransactionType,
    amount: number,
    direction: 'apply' | 'revert'
) => {
    const account = await Account.findById(accountId);
    if (!account) {
        throw new Error('ACCOUNT_NOT_FOUND');
    }

    const factor = direction === 'apply' ? 1 : -1;

    if (type === TransactionType.CASH_IN) {
        account.balance += factor * amount;
    } else {
        account.balance -= factor * amount;
    }

    if (account.balance < 0) {
        throw new Error('INSUFFICIENT_BALANCE');
    }

    await account.save();
    return account;
};

// GET /transaction - list all transactions
transactionRouter.get('/', async (_req, res) => {
    try {
        const transactions = await Transaction.find()
            .populate('account_id')
            .populate('perform_by')
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
            .populate('account_id')
            .populate('perform_by');

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
            account_id,
            amount,
            type,
            source,
            reference_code,
            perform_by
        } = req.body;

        if (!account_id || amount === undefined || !type || !source) {
            res.status(400).json({
                success: false,
                error: 'Thiếu trường bắt buộc: account_id, amount, type, source'
            });
            return;
        }

        if (!isValidObjectId(account_id) || (perform_by && !isValidObjectId(perform_by))) {
            res.status(400).json({
                success: false,
                error: 'account_id hoặc perform_by không hợp lệ'
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

        const account = await Account.findById(account_id);

        if (!account) {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản'
            });
            return;
        }

        if (!account.is_active) {
            res.status(400).json({
                success: false,
                error: 'Tài khoản đang bị khóa'
            });
            return;
        }

        const balance_before = account.balance;
        let balance_after = balance_before;

        if (type === TransactionType.CASH_IN) {
            balance_after += amount;
        } else {
            if (amount > balance_before) {
                res.status(400).json({
                    success: false,
                    error: 'Số dư không đủ để trừ'
                });
                return;
            }
            balance_after -= amount;
        }

        const transaction = await Transaction.create({
            account_id,
            amount,
            type,
            source,
            reference_code,
            perform_by,
            balance_before,
            balance_after
        });

        account.balance = balance_after;
        await account.save();

        const populated = await transaction.populate(['account_id', 'perform_by']);

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

        const payload = {
            account_id: req.body.account_id ?? existing.account_id,
            amount: req.body.amount ?? existing.amount,
            type: req.body.type ?? existing.type,
            source: req.body.source ?? existing.source,
            reference_code: req.body.reference_code ?? existing.reference_code,
            perform_by: req.body.perform_by ?? existing.perform_by
        };

        if (!isValidObjectId(payload.account_id.toString()) ||
            (payload.perform_by && !isValidObjectId(payload.perform_by.toString()))) {
            res.status(400).json({
                success: false,
                error: 'account_id hoặc perform_by không hợp lệ'
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

        const oldAccountId = normalizeObjectId(existing.account_id as any);
        const targetAccountId = normalizeObjectId(payload.account_id as any);

        // revert old effect
        const oldAccount = await applyTransactionEffect(oldAccountId, existing.type, existing.amount, 'revert');

        // if account changed, use new account; otherwise the revert already adjusted the same account
        const targetAccount = oldAccountId.equals(targetAccountId)
            ? oldAccount
            : await Account.findById(targetAccountId);

        if (!targetAccount) {
            throw new Error('ACCOUNT_NOT_FOUND');
        }

        if (!targetAccount.is_active) {
            res.status(400).json({
                success: false,
                error: 'Tài khoản đang bị khóa'
            });
            // re-apply old effect to keep data consistent
            await applyTransactionEffect(oldAccountId, existing.type, existing.amount, 'apply');
            return;
        }

        const balance_before = targetAccount.balance;
        let balance_after = balance_before;

        if (payload.type === TransactionType.CASH_IN) {
            balance_after += payload.amount;
        } else {
            if (payload.amount > balance_before) {
                res.status(400).json({
                    success: false,
                    error: 'Số dư không đủ để trừ'
                });
                // re-apply old effect before returning
                await applyTransactionEffect(oldAccountId, existing.type, existing.amount, 'apply');
                return;
            }
            balance_after -= payload.amount;
        }

        targetAccount.balance = balance_after;
        await targetAccount.save();

        const updated = await Transaction.findByIdAndUpdate(
            id,
            {
                $set: {
                    account_id: targetAccountId,
                    amount: payload.amount,
                    type: payload.type,
                    source: payload.source,
                    reference_code: payload.reference_code,
                    perform_by: payload.perform_by,
                    balance_before,
                    balance_after
                }
            },
            { new: true, runValidators: true }
        ).populate(['account_id', 'perform_by']);

        res.json({
            success: true,
            data: updated
        });
    } catch (error: any) {
        console.error('Error updating transaction:', error);

        if (error.message === 'ACCOUNT_NOT_FOUND') {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản'
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
            normalizeObjectId(existing.account_id as any),
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

        if (error.message === 'ACCOUNT_NOT_FOUND') {
            res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản'
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


