import {
  Event,
  EventType,
  EventStatus,
  GateId,
  Direction,
  Vehicle,
  VehicleGateStatus
} from '../models';
import { IRfidEventData, ICameraEventData } from '../models/eventModel';

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

      return {
        event
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

