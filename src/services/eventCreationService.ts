import {
  Event,
  EventType,
  EventStatus,
  Fee,
  FeeRecord,
  RfidEtc,
  Transaction,
  TransactionSource,
  TransactionType,
  Vehicle,
  VehicleGateStatus
} from '../models';
import { IRfidEventData, ICameraEventData } from '../models/eventModel';
import { FeeType } from '../models/feeModel';

export type EventCreationErrorCode = 'BAD_REQUEST' | 'INTERNAL_ERROR';

export class EventCreationError extends Error {
  public readonly code: EventCreationErrorCode;

  constructor(code: EventCreationErrorCode, message: string) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface EventCreationPayload {
  eventType: EventType;
  license_plate: string;
  gateId: string;
  rfidEvent?: IRfidEventData;
  cameraEvent?: ICameraEventData;
  status?: EventStatus;
  failureReason?: string;
  vehicle_id?: any;
  timestamp?: Date;
}

export interface EventCreationOptions {
  allowUnknownVehicle?: boolean;
}

export interface EventCreationResult {
  event: any;
  fee_record: any | null;
  transaction: any | null;
}

export class EventCreationService {
  public static async createEvent(
    payload: EventCreationPayload,
    options: EventCreationOptions = {}
  ): Promise<EventCreationResult> {
    try {
      const {
        eventType,
        license_plate,
        gateId,
        rfidEvent,
        cameraEvent,
        status,
        failureReason,
        vehicle_id,
        timestamp
      } = payload;

      console.log('[EVENT][CREATE] Incoming payload:', {
        eventType,
        license_plate,
        gateId,
        rfidEventProvided: Boolean(rfidEvent),
        cameraEventProvided: Boolean(cameraEvent)
      });

      if (!eventType || !Object.values(EventType).includes(eventType)) {
        throw new EventCreationError(
          'BAD_REQUEST',
          `Loại sự kiện không hợp lệ. Phải là một trong: ${Object.values(EventType).join(', ')}`
        );
      }

      if (!license_plate || !gateId) {
        throw new EventCreationError(
          'BAD_REQUEST',
          'Thiếu các trường bắt buộc: eventType, license_plate và gateId là bắt buộc'
        );
      }

      if (!rfidEvent && !cameraEvent) {
        throw new EventCreationError(
          'BAD_REQUEST',
          'Phải cung cấp ít nhất một trong rfidEvent hoặc cameraEvent'
        );
      }

      // Resolve timestamp
      let resolvedTimestamp: Date = timestamp ?? new Date();
      if (!timestamp) {
        if (rfidEvent?.timestamp && cameraEvent?.timestamp) {
          resolvedTimestamp = new Date(
            Math.min(new Date(rfidEvent.timestamp).getTime(), new Date(cameraEvent.timestamp).getTime())
          );
        } else if (rfidEvent?.timestamp) {
          resolvedTimestamp = new Date(rfidEvent.timestamp);
        } else if (cameraEvent?.timestamp) {
          resolvedTimestamp = new Date(cameraEvent.timestamp);
        }
      }

      const normalizedPlate = license_plate.trim().toUpperCase();
      const normalizedGateId = gateId.trim().toLowerCase();
      const gateStatusMap: Record<string, VehicleGateStatus> = {
        gate_in: VehicleGateStatus.GATE_IN,
        gate_out: VehicleGateStatus.GATE_OUT,
        inactive: VehicleGateStatus.INACTIVE
      };
      const targetGateStatus = gateStatusMap[normalizedGateId];
      const isGateIn = normalizedGateId === 'gate_in';
      const isGateOut = normalizedGateId === 'gate_out';

      const allowUnknownVehicle = Boolean(options.allowUnknownVehicle);

      let linkedVehicle = null;
      let applicableFee: any = null;
      let linkedRfidEtc: any = null;

      if (vehicle_id) {
        linkedVehicle = await Vehicle.findById(vehicle_id);
      }

      if (!linkedVehicle) {
        linkedVehicle = await Vehicle.findOne({ license_plate: normalizedPlate });
      }

      const ensureLinkedRfidEtc = async () => {
        if (!linkedRfidEtc && linkedVehicle?.rfid_etc) {
          linkedRfidEtc = await RfidEtc.findOne({ rfid_etc: linkedVehicle.rfid_etc.trim() });
        }
        return linkedRfidEtc;
      };

      if (!linkedVehicle && rfidEvent?.rfid_etc) {
        linkedVehicle = await Vehicle.findOne({ rfid_etc: rfidEvent.rfid_etc });
      }

      console.log('[EVENT][CREATE] Linked vehicle:', linkedVehicle?._id?.toString() || null, {
        hasVehicle: Boolean(linkedVehicle),
        vehicleType: linkedVehicle?.vehicle_type,
        rfid_etc: linkedVehicle?.rfid_etc
      });

      if (linkedVehicle && !linkedVehicle.license_plate) {
        linkedVehicle.license_plate = normalizedPlate;
      }

      if (isGateIn) {
        if (!linkedVehicle && !allowUnknownVehicle) {
          throw new EventCreationError('BAD_REQUEST', 'Không tìm thấy phương tiện tương ứng với sự kiện gate_in');
        }

        if (linkedVehicle) {
          const feeFilter: any = { fee_type: FeeType.PASSING };
          if (linkedVehicle.vehicle_type) {
            feeFilter.vehicle_type = linkedVehicle.vehicle_type;
          } else {
            feeFilter.vehicle_type = { $exists: false };
          }

          applicableFee = await Fee.findOne(feeFilter);
          console.log('[EVENT][CREATE] PASSING fee resolved:', applicableFee?._id?.toString() || null);

          if (!applicableFee) {
            throw new EventCreationError('BAD_REQUEST', 'Chưa cấu hình biểu phí passing cho loại phương tiện này');
          }

          if (linkedVehicle.rfid_etc) {
            linkedRfidEtc = await RfidEtc.findOne({ rfid_etc: linkedVehicle.rfid_etc });
            console.log('[EVENT][CREATE] PASSING RFID info:', {
              rfid_etc: linkedRfidEtc?.rfid_etc,
              balance: linkedRfidEtc?.balance,
              is_active: linkedRfidEtc?.is_active
            });

            if (linkedRfidEtc) {
              if (!linkedRfidEtc.is_active) {
                throw new EventCreationError('BAD_REQUEST', 'RFID/ETC của phương tiện đang bị khóa');
              }

              if (linkedRfidEtc.balance < applicableFee.amount) {
                throw new EventCreationError('BAD_REQUEST', 'Số dư RFID/ETC không đủ để trừ phí');
              }
            }
          }
        }
      }

      if (isGateOut) {
        if (!linkedVehicle && !allowUnknownVehicle) {
          throw new EventCreationError('BAD_REQUEST', 'Không tìm thấy phương tiện tương ứng với sự kiện gate_out');
        }

        if (linkedVehicle) {
          const latestGateInEvent = await Event.findOne({
            vehicle_id: linkedVehicle._id,
            gateId: 'gate_in'
          }).sort({ timestamp: -1 });

          if (!latestGateInEvent && !allowUnknownVehicle) {
            throw new EventCreationError(
              'BAD_REQUEST',
              'Không tìm thấy sự kiện gate_in trước đó cho phương tiện này'
            );
          }

          if (latestGateInEvent) {
            const feeFilter: any = { fee_type: FeeType.PARKING };
            if (linkedVehicle.vehicle_type) {
              feeFilter.vehicle_type = linkedVehicle.vehicle_type;
            } else {
              feeFilter.vehicle_type = { $exists: false };
            }

            applicableFee = await Fee.findOne(feeFilter);
            console.log('[EVENT][CREATE] PARKING fee resolved:', applicableFee?._id?.toString() || null);

            if (!applicableFee) {
              throw new EventCreationError('BAD_REQUEST', 'Chưa cấu hình biểu phí parking cho loại phương tiện này');
            }

            if (linkedVehicle.rfid_etc) {
              linkedRfidEtc = await RfidEtc.findOne({ rfid_etc: linkedVehicle.rfid_etc });
              console.log('[EVENT][CREATE] PARKING RFID info:', {
                rfid_etc: linkedRfidEtc?.rfid_etc,
                balance: linkedRfidEtc?.balance,
                is_active: linkedRfidEtc?.is_active
              });

              if (linkedRfidEtc) {
                if (!linkedRfidEtc.is_active) {
                  throw new EventCreationError('BAD_REQUEST', 'RFID/ETC của phương tiện đang bị khóa');
                }
              }
            }
          }
        }
      }

      const eventData: any = {
        eventType,
        license_plate: normalizedPlate,
        gateId,
        timestamp: resolvedTimestamp
      };

      if (status) {
        eventData.status = status;
      }
      if (failureReason) {
        eventData.failureReason = failureReason;
      }

      if (linkedVehicle) {
        eventData.vehicle_id = linkedVehicle._id;
      } else if (vehicle_id) {
        eventData.vehicle_id = vehicle_id;
      }

      if (rfidEvent) eventData.rfidEvent = rfidEvent;
      if (cameraEvent) eventData.cameraEvent = cameraEvent;

      const event = await Event.create(eventData);
      console.log('[EVENT][CREATE] Event persisted with id:', event._id.toString());

      if (!linkedVehicle && normalizedPlate) {
        linkedVehicle = await Vehicle.findOne({ license_plate: normalizedPlate });
      }

      if (linkedVehicle && targetGateStatus && linkedVehicle.gate !== targetGateStatus) {
        linkedVehicle.gate = targetGateStatus;
        await linkedVehicle.save();
        console.log('[EVENT][CREATE] Vehicle gate updated:', {
          vehicleId: linkedVehicle._id.toString(),
          gate: linkedVehicle.gate
        });
      }

      let createdFeeRecord: any = null;
      let createdTransaction: any = null;

      if (isGateIn && linkedVehicle && applicableFee) {
        await ensureLinkedRfidEtc();

        const feeRecord = await FeeRecord.create({
          vehicle_id: linkedVehicle._id,
          event_id: event._id,
          fee_id: applicableFee._id,
          timestamp: resolvedTimestamp,
          amount: applicableFee.amount,
          is_paid: false
        });
        console.log('[EVENT][CREATE] PASSING fee record created:', feeRecord._id.toString());

        if (linkedRfidEtc) {
          if (linkedRfidEtc.balance < applicableFee.amount) {
            throw new EventCreationError('BAD_REQUEST', 'Số dư RFID/ETC không đủ để trừ phí');
          }

          const balance_before = linkedRfidEtc.balance;
          const balance_after = balance_before - applicableFee.amount;
          const note = `${new Date().toISOString()} passing ${applicableFee.fee_name}`;

          const transaction = await Transaction.create({
            rfid_etc_id: linkedRfidEtc._id,
            amount: applicableFee.amount,
            type: TransactionType.CASH_OUT,
            source: TransactionSource.CASH,
            balance_before,
            balance_after,
            note
          });
          console.log('[EVENT][CREATE] PASSING transaction created:', transaction._id.toString());

          linkedRfidEtc.balance = balance_after;
          await linkedRfidEtc.save();

          feeRecord.transaction_id = transaction._id as any;
          feeRecord.is_paid = true;
          feeRecord.paid_at = new Date();
          await feeRecord.save();

          createdTransaction = await transaction.populate('rfid_etc_id');
        }

        createdFeeRecord = await feeRecord.populate(['vehicle_id', 'event_id', 'fee_id', 'transaction_id']);
      }

      if (isGateOut && linkedVehicle && applicableFee) {
        const latestGateInEvent = await Event.findOne({
          vehicle_id: linkedVehicle._id,
          gateId: 'gate_in'
        }).sort({ timestamp: -1 });

        if (latestGateInEvent) {
          const parkingTimeInMs = resolvedTimestamp.getTime() - latestGateInEvent.timestamp.getTime();
          const parkingTimeInHours = parkingTimeInMs / (1000 * 60 * 60);
          const parkingTimeInMinutes = Math.round(parkingTimeInHours * 60);
          const calculatedAmount = applicableFee.amount * parkingTimeInHours;

          await ensureLinkedRfidEtc();

          const feeRecord = await FeeRecord.create({
            vehicle_id: linkedVehicle._id,
            event_id: event._id,
            fee_id: applicableFee._id,
            timestamp: resolvedTimestamp,
            amount: calculatedAmount,
            parking_time: parkingTimeInMinutes,
            is_paid: false
          });
          console.log('[EVENT][CREATE] PARKING fee record created:', feeRecord._id.toString(), {
            calculatedAmount,
            parkingTimeInMinutes
          });

          if (linkedRfidEtc) {
            if (linkedRfidEtc.balance < calculatedAmount) {
              throw new EventCreationError('BAD_REQUEST', 'Số dư RFID/ETC không đủ để trừ phí parking');
            }

            const balance_before = linkedRfidEtc.balance;
            const balance_after = balance_before - calculatedAmount;
            const note = `${new Date().toISOString()} parking ${applicableFee.fee_name} (${parkingTimeInHours.toFixed(2)} giờ)`;

            const transaction = await Transaction.create({
              rfid_etc_id: linkedRfidEtc._id,
              amount: calculatedAmount,
              type: TransactionType.CASH_OUT,
              source: TransactionSource.CASH,
              balance_before,
              balance_after,
              note
            });
            console.log('[EVENT][CREATE] PARKING transaction created:', transaction._id.toString());

            linkedRfidEtc.balance = balance_after;
            await linkedRfidEtc.save();

            feeRecord.transaction_id = transaction._id as any;
            feeRecord.is_paid = true;
            feeRecord.paid_at = new Date();
            await feeRecord.save();

            createdTransaction = await transaction.populate('rfid_etc_id');
          }

          createdFeeRecord = await feeRecord.populate(['vehicle_id', 'event_id', 'fee_id', 'transaction_id']);
        }
      }

      await event.populate('vehicle_id', 'license_plate vehicle_type company rfid_etc gate');

      return {
        event,
        fee_record: createdFeeRecord,
        transaction: createdTransaction
      };
    } catch (error: any) {
      console.error('[EVENT][CREATE] Error:', error);
      if (error instanceof EventCreationError) {
        throw error;
      }
      throw new EventCreationError('INTERNAL_ERROR', error?.message || 'Không thể tạo sự kiện');
    }
  }
}

export default EventCreationService;

