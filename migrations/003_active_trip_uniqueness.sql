CREATE UNIQUE INDEX trips_one_open_vehicle_idx ON trips (vehicle_id) WHERE status <> 'closed';
CREATE UNIQUE INDEX trips_one_open_driver_idx ON trips (driver_id) WHERE status <> 'closed';
