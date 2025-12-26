import express from 'express';
import { Vehicle, Employee, RfidEtc, Event, Direction, VehicleType, Transaction, TransactionType } from '../../models';
import { internalError } from '../../utils';

const statisticRouter = express.Router();

// GET /employee/statistic - Get basic statistics
statisticRouter.get('/', async (req, res) => {
    try {
        // Count total active vehicles
        const totalVehicles = await Vehicle.countDocuments({ is_active: true });

        // Count total active employees
        const totalEmployees = await Employee.countDocuments({ isActive: true });

        // Count total active RFID/ETC cards
        const totalRfidEtc = await RfidEtc.countDocuments({ is_active: true });

        // Get today's date range (start and end of today)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow

        // Count today's activities
        const todayTotal = await Event.countDocuments({
            timestamp: {
                $gte: today,
                $lt: tomorrow
            }
        });

        // Count today's entries (direction === 'in')
        const todayEntries = await Event.countDocuments({
            timestamp: {
                $gte: today,
                $lt: tomorrow
            },
            direction: Direction.IN
        });

        // Count today's exits (direction === 'out')
        const todayExits = await Event.countDocuments({
            timestamp: {
                $gte: today,
                $lt: tomorrow
            },
            direction: Direction.OUT
        });

        res.json({
            success: true,
            data: {
                totalVehicles,
                totalEmployees,
                totalRfidEtc,
                todayTotal,
                todayEntries,
                todayExits
            }
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        internalError(res, 'Không thể lấy thống kê');
    }
});

// GET /employee/statistic/vehicle-types - Get vehicle types distribution
statisticRouter.get('/vehicle-types', async (req, res) => {
    try {
        // Map vehicle types to Vietnamese names and colors
        const vehicleTypeMap: Record<VehicleType, { name: string; color: string }> = {
            [VehicleType.CONTRACT]: { name: 'Hợp đồng', color: '#3b82f6' },
            [VehicleType.TRANSFER]: { name: 'Trung chuyển', color: '#10b981' },
            [VehicleType.ROUTE]: { name: 'Trong tuyến', color: '#8b5cf6' },
            [VehicleType.VISITOR]: { name: 'Vãng lai', color: '#f59e0b' },
            [VehicleType.INTERNAL]: { name: 'Nội bộ', color: '#ef4444' }
        };

        // Get all vehicle types
        const vehicleTypes = Object.values(VehicleType);

        // Count vehicles by type (only active vehicles)
        const distribution = await Promise.all(
            vehicleTypes.map(async (type) => {
                const count = await Vehicle.countDocuments({
                    vehicle_type: type,
                    is_active: true
                });

                return {
                    name: vehicleTypeMap[type].name,
                    value: count,
                    color: vehicleTypeMap[type].color,
                    type: type
                };
            })
        );

        // Filter out types with 0 vehicles
        const filteredDistribution = distribution.filter(item => item.value > 0);

        res.json({
            success: true,
            data: filteredDistribution
        });
    } catch (error) {
        console.error('Error fetching vehicle types distribution:', error);
        internalError(res, 'Không thể lấy phân bố loại phương tiện');
    }
});

// GET /employee/statistic/revenue - Get revenue statistics
statisticRouter.get('/revenue', async (req, res) => {
    try {
        // Get date range from query params (optional)
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : null;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : null;

        // Build date filter
        const dateFilter: any = {};
        if (startDate) {
            startDate.setHours(0, 0, 0, 0);
            dateFilter.createdAt = { $gte: startDate };
        }
        if (endDate) {
            endDate.setHours(23, 59, 59, 999);
            if (dateFilter.createdAt) {
                dateFilter.createdAt.$lte = endDate;
            } else {
                dateFilter.createdAt = { $lte: endDate };
            }
        }

        // Filter for fee transactions (debit type - money deducted from RFID card when vehicle exits)
        const feeTransactions = await Transaction.find({
            type: TransactionType.DEBIT,
            ...dateFilter
        }).sort({ createdAt: -1 });

        // Calculate total revenue
        const totalRevenue = feeTransactions.reduce((sum, tx) => sum + tx.amount, 0);

        // Calculate today's revenue
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayTransactions = feeTransactions.filter(tx => {
            const txDate = new Date(tx.createdAt);
            return txDate >= today && txDate < tomorrow;
        });

        const todayRevenue = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);

        // Calculate revenue by date (for chart)
        const revenueByDate: Record<string, number> = {};
        feeTransactions.forEach(tx => {
            const dateKey = new Date(tx.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
            revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + tx.amount;
        });

        // Convert to array format for chart
        const revenueChartData = Object.entries(revenueByDate)
            .map(([date, amount]) => {
                const dateObj = new Date(date);
                const day = dateObj.getDate().toString().padStart(2, '0');
                const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                return {
                    date: `${day}/${month}`,
                    revenue: amount
                };
            })
            .sort((a, b) => {
                // Sort by date string (DD/MM format)
                const [dayA, monthA] = a.date.split('/').map(Number);
                const [dayB, monthB] = b.date.split('/').map(Number);
                if (monthA !== monthB) return monthA - monthB;
                return dayA - dayB;
            })
            .slice(-30); // Last 30 days

        res.json({
            success: true,
            data: {
                totalRevenue,
                todayRevenue,
                totalTransactions: feeTransactions.length,
                todayTransactions: todayTransactions.length,
                revenueChartData
            }
        });
    } catch (error) {
        console.error('Error fetching revenue statistics:', error);
        internalError(res, 'Không thể lấy thống kê doanh thu');
    }
});

// GET /employee/statistic/traffic-7days - Get traffic statistics for last 7 days
statisticRouter.get('/traffic-7days', async (req, res) => {
    try {
        // Calculate date range for last 7 days
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Include today, so 6 days ago + today = 7 days

        // Get all events in the last 7 days
        const events = await Event.find({
            timestamp: {
                $gte: sevenDaysAgo,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) // End of today
            }
        });

        // Group events by date and direction
        const trafficByDate: Record<string, { entries: number; exits: number }> = {};

        // Initialize all 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
            trafficByDate[dateKey] = { entries: 0, exits: 0 };
        }

        // Count events by date and direction
        events.forEach(event => {
            const eventDate = new Date(event.timestamp);
            eventDate.setHours(0, 0, 0, 0);
            const dateKey = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD

            if (trafficByDate[dateKey]) {
                if (event.direction === Direction.IN) {
                    trafficByDate[dateKey].entries++;
                } else if (event.direction === Direction.OUT) {
                    trafficByDate[dateKey].exits++;
                }
            }
        });

        // Convert to array format for chart
        const trafficChartData = Object.entries(trafficByDate)
            .map(([date, data]) => {
                const dateObj = new Date(date);
                const day = dateObj.getDate().toString().padStart(2, '0');
                const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                return {
                    date: `${day}/${month}`,
                    entries: data.entries,
                    exits: data.exits
                };
            })
            .sort((a, b) => {
                // Sort by date string (DD/MM format)
                const [dayA, monthA] = a.date.split('/').map(Number);
                const [dayB, monthB] = b.date.split('/').map(Number);
                if (monthA !== monthB) return monthA - monthB;
                return dayA - dayB;
            });

        res.json({
            success: true,
            data: trafficChartData
        });
    } catch (error) {
        console.error('Error fetching traffic statistics:', error);
        internalError(res, 'Không thể lấy thống kê lưu lượng xe');
    }
});

// GET /employee/statistic/traffic-hourly - Get traffic statistics for last 24 hours
statisticRouter.get('/traffic-hourly', async (req, res) => {
    try {
        // Calculate date range for last 24 hours
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get all events in the last 24 hours
        const events = await Event.find({
            timestamp: {
                $gte: twentyFourHoursAgo,
                $lte: now
            }
        });

        // Group events by hour (0-23)
        const trafficByHour: Record<number, number> = {};

        // Initialize all 24 hours
        for (let i = 0; i < 24; i++) {
            trafficByHour[i] = 0;
        }

        // Count events by hour
        events.forEach(event => {
            const eventDate = new Date(event.timestamp);
            const hour = eventDate.getHours();
            trafficByHour[hour]++;
        });

        // Convert to array format for chart
        const trafficHourlyChartData = Object.entries(trafficByHour)
            .map(([hour, count]) => ({
                hour: `${hour.toString().padStart(2, '0')}:00`,
                vehicles: count
            }))
            .sort((a, b) => {
                const hourA = parseInt(a.hour.split(':')[0]);
                const hourB = parseInt(b.hour.split(':')[0]);
                return hourA - hourB;
            });

        res.json({
            success: true,
            data: trafficHourlyChartData
        });
    } catch (error) {
        console.error('Error fetching hourly traffic statistics:', error);
        internalError(res, 'Không thể lấy thống kê lưu lượng theo giờ');
    }
});

// GET /employee/statistic/vehicle-status - Get vehicle status statistics (inside/outside station)
statisticRouter.get('/vehicle-status', async (req, res) => {
    try {
        // Get all active vehicles
        const vehicles = await Vehicle.find({ is_active: true }).select('_id license_plate');

        let insideStation = 0;
        let outsideStation = 0;

        // For each vehicle, find the latest event
        for (const vehicle of vehicles) {
            const latestEvent = await Event.findOne({
                vehicle_id: vehicle._id
            })
            .sort({ timestamp: -1 })
            .limit(1)
            .select('direction');

            // If latest event is IN, vehicle is inside station
            // If latest event is OUT or no event, vehicle is outside station
            if (latestEvent && latestEvent.direction === Direction.IN) {
                insideStation++;
            } else {
                outsideStation++;
            }
        }

        res.json({
            success: true,
            data: {
                insideStation,
                outsideStation
            }
        });
    } catch (error) {
        console.error('Error fetching vehicle status statistics:', error);
        internalError(res, 'Không thể lấy thống kê trạng thái phương tiện');
    }
});

// GET /employee/statistic/alerts - Get alert statistics (expired and expiring soon RFID/ETC cards)
statisticRouter.get('/alerts', async (req, res) => {
    try {
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        // Count expired RFID/ETC cards (expiration_date < now and is_active = true)
        const expiredCount = await RfidEtc.countDocuments({
            is_active: true,
            expiration_date: { $lt: now }
        });

        // Count RFID/ETC cards expiring soon (expiration_date between now and 30 days from now, and is_active = true)
        const expiringSoonCount = await RfidEtc.countDocuments({
            is_active: true,
            expiration_date: {
                $gte: now,
                $lte: thirtyDaysFromNow
            }
        });

        res.json({
            success: true,
            data: {
                expiredCount,
                expiringSoonCount
            }
        });
    } catch (error) {
        console.error('Error fetching alert statistics:', error);
        internalError(res, 'Không thể lấy thống kê cảnh báo');
    }
});

export default statisticRouter;

