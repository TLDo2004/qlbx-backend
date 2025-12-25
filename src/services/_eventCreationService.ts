import {
  Event,
  EventType,
  EventStatus,
  GateId,
  Direction,
  Vehicle,
  VehicleGateStatus,
  RfidEtc,
  ParkingSession,
  ParkingSessionStatus,
  FeeRule,
  FeeRecord,
  FeeRecordStatus,
  Transaction,
  TransactionType,
  TransactionSource
} from '../models';
import { IRfidEventData, ICameraEventData } from '../models/eventModel';
import { io } from '../api';

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
  gateId: GateId;
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
}

export class EventCreationService {
  /**
   * Entry point chính để tạo event:
   * - saveEvent (lưu event vào DB)
   * - nếu direction = OUT thì handleExitEvent(event)
   * - ngược lại handleEntryEvent(event)
   * - emit event qua WebSocket để frontend cập nhật real-time
   */
  public static async createEvent(
    payload: EventCreationPayload,
    options: EventCreationOptions = {}
  ): Promise<EventCreationResult> {
    const { event } = await this.saveEvent(payload, options);

    let result: EventCreationResult;
    if (event.direction === Direction.OUT) {
      result = await this.handleExitEvent(event);
    } else {
      result = await this.handleEntryEvent(event);
    }

    // Populate event đầy đủ trước khi emit
    const populatedEvent = await Event.findById(event._id)
      .populate({
        path: 'vehicle_id',
        populate: [
          {
            path: 'companyId',
            select: 'name tax_code address phone contract_start contract_end is_active'
          },
          {
            path: 'routeId',
            select: 'name origin destination'
          }
        ]
      })
      .lean();

    // Emit event qua WebSocket để frontend cập nhật real-time
    if (populatedEvent && io) {
      io.emit('new_event', populatedEvent);
      console.log('[WebSocket] Emitted new event:', populatedEvent._id?.toString());
    }

    return result;
  }

  /**
   * Thực hiện lưu event vào DB, không xử lý business logic vào/ra
   */
  private static async saveEvent(
    payload: EventCreationPayload,
    options: EventCreationOptions = {}
  ): Promise<{ event: any }> {
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
      const gateStatusMap: Record<GateId, VehicleGateStatus> = {
        [GateId.GATE_IN]: VehicleGateStatus.GATE_IN,
        [GateId.GATE_OUT]: VehicleGateStatus.GATE_OUT
      };
      const directionMap: Record<GateId, Direction> = {
        [GateId.GATE_IN]: Direction.IN,
        [GateId.GATE_OUT]: Direction.OUT
      };
      const targetGateStatus = gateStatusMap[gateId];
      const isGateIn = gateId === GateId.GATE_IN;
      const isGateOut = gateId === GateId.GATE_OUT;

      const allowUnknownVehicle = Boolean(options.allowUnknownVehicle);

      let linkedVehicle = null;

      if (vehicle_id) {
        linkedVehicle = await Vehicle.findById(vehicle_id);
      }

      if (!linkedVehicle) {
        linkedVehicle = await Vehicle.findOne({ license_plate: normalizedPlate });
      }

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
      }

      if (isGateOut) {
        if (!linkedVehicle && !allowUnknownVehicle) {
          throw new EventCreationError('BAD_REQUEST', 'Không tìm thấy phương tiện tương ứng với sự kiện gate_out');
        }

        if (linkedVehicle) {
          const latestGateInEvent = await Event.findOne({
            vehicle_id: linkedVehicle._id,
            gateId: GateId.GATE_IN
          }).sort({ timestamp: -1 });

          if (!latestGateInEvent && !allowUnknownVehicle) {
            throw new EventCreationError(
              'BAD_REQUEST',
              'Không tìm thấy sự kiện gate_in trước đó cho phương tiện này'
            );
          }
        }
      }

      const eventData: any = {
        eventType,
        license_plate: normalizedPlate,
        gateId,
        direction: directionMap[gateId],
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

      await event.populate({
        path: 'vehicle_id',
        populate: [
          {
            path: 'companyId',
            select: 'name tax_code address phone contract_start contract_end is_active'
          },
          {
            path: 'routeId',
            select: 'name origin destination'
          }
        ]
      });

      return { event };
    } catch (error: any) {
      console.error('[EVENT][CREATE] Error:', error);
      if (error instanceof EventCreationError) {
        throw error;
      }
      throw new EventCreationError('INTERNAL_ERROR', error?.message || 'Không thể tạo sự kiện');
    }
  }

  /**
   * Handle sự kiện vào cổng (gate_in):
   * - KHÔNG lưu event, chỉ xử lý trên event đã được saveEvent tạo ra
   * - tạo parking_session cho tất cả entry events có vehicle_id (để track và tính phí khi ra)
   */
  public static async handleEntryEvent(event: any): Promise<{ event: any; parkingSession?: any }> {
    // Bắt buộc gate_in
    if (event.gateId !== GateId.GATE_IN) {
      throw new EventCreationError('BAD_REQUEST', 'handleEntryEvent chỉ dùng cho gate_in');
    }

    let parkingSession: any | undefined;

    // Tạo parking session cho tất cả entry events có vehicle_id
    // (cần để track và tính phí khi xe ra, không phụ thuộc vào status)
    if (!event.vehicle_id) {
      // Không có vehicle_id thì không tạo được parking_session
      console.warn(
        '[ENTRY] Cannot create parking_session: event has no vehicle_id',
        event._id?.toString?.()
      );
    } else {
      parkingSession = await this.createParkingSession({
        vehicle_id: event.vehicle_id,
        entry_event_id: event._id,
        entry_time: event.timestamp
      });
      console.log('[ENTRY] Parking session created:', {
        sessionId: parkingSession._id?.toString?.(),
        vehicleId: event.vehicle_id?.toString?.(),
        entryEventId: event._id?.toString?.()
      });
    }

    return { event, parkingSession };
  }

  /**
   * Handle sự kiện ra cổng (gate_out):
   * - KHÔNG lưu event, chỉ xử lý trên event đã được saveEvent tạo ra
   * - nếu status !== passed (ACCEPTED) thì return
   * - nếu không có open session -> FAILED + NO_OPEN_SESSION
   * - check fee rule theo số ghế, check balance RFID
   * - nếu thiếu tiền -> BLOCKED + INSUFFICIENT_BALANCE
   * - ngược lại: đóng session, tạo fee_record, transaction, update fee_record = paid
   */
  public static async handleExitEvent(event: any): Promise<{
    event: any;
    parkingSession?: any;
    feeRule?: any;
    feeRecord?: any;
    transaction?: any;
  }> {
    if (event.gateId !== GateId.GATE_OUT) {
      throw new EventCreationError('BAD_REQUEST', 'handleExitEvent chỉ dùng cho gate_out');
    }

    // Nếu event không phải "passed" (ACCEPTED) thì không tính phí
    if (event.status !== EventStatus.ACCEPTED) {
      return { event };
    }

    if (!event.vehicle_id) {
      await this.updateEventStatus(event._id, {
        status: EventStatus.FAILED,
        failureReason: 'NO_VEHICLE_FOR_EXIT_EVENT'
      });
      return { event };
    }

    // Lấy open session của xe
    const session = await this.getOpenParkingSession(event.vehicle_id);
    if (!session) {
      const updatedEvent = await this.updateEventStatus(event._id, {
        status: EventStatus.FAILED,
        failureReason: 'NO_OPEN_SESSION'
      });
      return { event: updatedEvent ?? event };
    }

    // Lấy vehicle (đã populate ở saveEvent)
    const vehicle = event.vehicle_id;
    const seatCount = vehicle?.seat;
    const feeRule = await this.getFeeRuleBySeat(seatCount);
    if (!feeRule) {
      const updatedEvent = await this.updateEventStatus(event._id, {
        status: EventStatus.FAILED,
        failureReason: 'NO_FEE_RULE_FOR_SEAT'
      });
      return { event: updatedEvent ?? event };
    }

    const amount: number = feeRule.amount;

    // Lấy mã RFID/ETC từ vehicle, sau đó lookup document RFID trong collection riêng
    const rfidCode: string | undefined = vehicle?.rfid_etc;
    if (!rfidCode) {
      const updatedEvent = await this.updateEventStatus(event._id, {
        status: EventStatus.FAILED,
        failureReason: 'NO_RFID_BALANCE_INFO'
      });
      return { event: updatedEvent ?? event, feeRule };
    }

    const rfidEtc = await RfidEtc.findOne({ rfid_etc: rfidCode });
    if (!rfidEtc || typeof rfidEtc.balance !== 'number') {
      const updatedEvent = await this.updateEventStatus(event._id, {
        status: EventStatus.FAILED,
        failureReason: 'NO_RFID_BALANCE_INFO'
      });
      return { event: updatedEvent ?? event, feeRule };
    }

    // Nếu balance không đủ
    if (rfidEtc.balance < amount) {
      const updatedEvent = await this.updateEventStatus(event._id, {
        status: EventStatus.REJECTED,
        failureReason: 'INSUFFICIENT_BALANCE'
      });
      return { event: updatedEvent ?? event, feeRule };
    }

    // Đóng session
    const closedSession = await this.closeParkingSession({
      vehicle_id: event.vehicle_id,
      exit_event_id: event._id,
      exit_time: event.timestamp
    });

    // Tạo fee record
    const feeRecord = await this.createFeeRecord({
      parking_session_id: closedSession?._id ?? session._id,
      vehicle_id: event.vehicle_id,
      fee_rule_id: feeRule._id,
      amount
    });

    // Tính balance mới và cập nhật vào tài khoản RFID/ETC
    const balance_before = rfidEtc.balance;
    const balance_after = rfidEtc.balance - amount;

    const transaction = await this.createTransaction({
      rfid_etc_id: rfidEtc._id,
      amount,
      related_fee_record_id: feeRecord._id,
      balance_before,
      balance_after
    });

    // Cập nhật balance thực tế trong collection rfid_etc
    rfidEtc.balance = balance_after;
    await rfidEtc.save();

    // Update fee record thành paid
    const updatedFeeRecord = await this.updateFeeRecord(feeRecord._id, {
      status: FeeRecordStatus.PAID,
      paid_at: new Date()
    });

    return {
      event,
      parkingSession: closedSession ?? session,
      feeRule,
      feeRecord: updatedFeeRecord ?? feeRecord,
      transaction
    };
  }

  /**
   * Helper: tạo phiên đậu xe khi xe vào
   */
  private static async createParkingSession(params: {
    vehicle_id: any;
    entry_event_id: any;
    entry_time: Date;
  }) {
    const { vehicle_id, entry_event_id, entry_time } = params;
    return ParkingSession.create({
      vehicle_id,
      entry_event_id,
      entry_time,
      status: ParkingSessionStatus.OPEN
    });
  }

  /**
   * Helper: lấy parking session đang mở của 1 xe
   */
  private static async getOpenParkingSession(vehicle_id: any) {
    return ParkingSession.findOne({
      vehicle_id,
      status: ParkingSessionStatus.OPEN
    });
  }

  /**
   * Helper: cập nhật status/failureReason của event
   */
  private static async updateEventStatus(eventId: any, update: Partial<Pick<any, 'status' | 'failureReason'>>) {
    return Event.findByIdAndUpdate(
      eventId,
      {
        $set: update
      },
      { new: true }
    );
  }

  /**
   * Helper: tìm fee rule theo số ghế (seat) đã cấu hình
   */
  private static async getFeeRuleBySeat(seatCount: number) {
    if (seatCount == null) return null;
    return FeeRule.findOne({
      is_active: true,
      min_seat: { $lte: seatCount },
      max_seat: { $gte: seatCount }
    }).sort({ amount: 1 });
  }

  /**
   * Helper: đóng parking session khi xe ra
   */
  private static async closeParkingSession(params: {
    vehicle_id: any;
    exit_event_id: any;
    exit_time: Date;
  }) {
    const { vehicle_id, exit_event_id, exit_time } = params;
    return ParkingSession.findOneAndUpdate(
      {
        vehicle_id,
        status: ParkingSessionStatus.OPEN
      },
      {
        $set: {
          exit_event_id,
          exit_time,
          status: ParkingSessionStatus.CLOSED
        }
      },
      { new: true }
    );
  }

  /**
   * Helper: tạo fee record cho 1 phiên đậu xe
   */
  private static async createFeeRecord(params: {
    parking_session_id?: any;
    vehicle_id: any;
    fee_rule_id: any;
    amount: number;
  }) {
    const { parking_session_id, vehicle_id, fee_rule_id, amount } = params;
    return FeeRecord.create({
      parking_session_id,
      vehicle_id,
      fee_rule_id,
      amount,
      status: FeeRecordStatus.PENDING
    });
  }

  /**
   * Helper: tạo transaction debit gắn với fee record
   */
  private static async createTransaction(params: {
    rfid_etc_id: any;
    amount: number;
    related_fee_record_id?: any;
    source?: TransactionSource;
    balance_before: number;
    balance_after: number;
  }) {
    const {
      rfid_etc_id,
      amount,
      related_fee_record_id,
      source = TransactionSource.CARD,
      balance_before,
      balance_after
    } = params;

    return Transaction.create({
      rfid_etc_id,
      amount,
      type: TransactionType.DEBIT,
      related_fee_record_id,
      source,
      balance_before,
      balance_after
    });
  }

  /**
   * Helper: cập nhật fee record (status / paid_at / amount ...)
   */
  private static async updateFeeRecord(feeRecordId: any, update: Partial<{ status: FeeRecordStatus; paid_at: Date; amount: number }>) {
    return FeeRecord.findByIdAndUpdate(
      feeRecordId,
      {
        $set: update
      },
      { new: true }
    );
  }
}

export default EventCreationService;

