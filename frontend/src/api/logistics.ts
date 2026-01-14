import { apiRequest } from './client';

export type TransportVehicle = {
  name: string;
  driver?: string;
  passenger_capacity: number;
  notes?: string;
  event_vehicle_id?: number;
};

export type Transport = {
  id: number;
  pickup_location: string;
  destination: string;
  passenger_count: number;
  scheduled_at?: string;
  notes?: string | null;
  event_id?: number | null;
  season_id?: number | null;
  vehicles: TransportVehicle[];
  created_at: string;
};

export const listTransports = () => apiRequest<Transport[]>('/logistics/transports');
export const getTransport = (id: number) => apiRequest<Transport>(`/logistics/transports/${id}`);

export type CreateTransportPayload = {
  pickup_location: string;
  destination: string;
  passenger_count: number;
  scheduled_at?: string;
  notes?: string;
  event_id: number;
  vehicle_ids: number[];
};

export type UpdateTransportPayload = Omit<CreateTransportPayload, 'vehicle_ids'> & {
  vehicle_ids?: number[];
};

export const createTransport = (payload: CreateTransportPayload) =>
  apiRequest<Transport>('/logistics/transports', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateTransport = (id: number, payload: UpdateTransportPayload) =>
  apiRequest<Transport>(`/logistics/transports/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteTransport = (id: number) =>
  apiRequest<void>(`/logistics/transports/${id}`, { method: 'DELETE' });

export type EventVehicle = {
  id: number;
  event_id: number;
  name: string;
  driver?: string;
  passenger_capacity: number;
  notes?: string;
  created_at: string;
};

export type CreateEventVehiclePayload = {
  event_id: number;
  name: string;
  driver?: string;
  passenger_capacity: number;
  notes?: string;
};

export const listEventVehicles = () => apiRequest<EventVehicle[]>('/logistics/vehicles');

export const createEventVehicle = (payload: CreateEventVehiclePayload) =>
  apiRequest<EventVehicle>('/logistics/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getEventVehicle = (id: number) => apiRequest<EventVehicle>(`/logistics/vehicles/${id}`);

export const updateEventVehicle = (id: number, payload: CreateEventVehiclePayload) =>
  apiRequest<EventVehicle>(`/logistics/vehicles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteEventVehicle = (id: number) =>
  apiRequest<void>(`/logistics/vehicles/${id}`, { method: 'DELETE' });

export type OtherLogistic = {
  id: number;
  name: string;
  coordinates?: string | null;
  scheduled_at?: string | null;
  description?: string | null;
  notes?: string | null;
  event_id?: number | null;
  season_id?: number | null;
  created_at: string;
};

export type CreateOtherPayload = {
  name: string;
  coordinates?: string;
  scheduled_at?: string;
  description?: string;
  notes?: string;
  event_id: number;
};

export const listOthers = () => apiRequest<OtherLogistic[]>('/logistics/others');
export const getOther = (id: number) => apiRequest<OtherLogistic>(`/logistics/others/${id}`);
export const createOther = (payload: CreateOtherPayload) =>
  apiRequest<OtherLogistic>('/logistics/others', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updateOther = (id: number, payload: CreateOtherPayload) =>
  apiRequest<OtherLogistic>(`/logistics/others/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
export const deleteOther = (id: number) =>
  apiRequest<void>(`/logistics/others/${id}`, { method: 'DELETE' });

export type Meal = {
  id: number;
  name: string;
  location?: string | null;
  scheduled_at?: string | null;
  notes?: string | null;
  event_id?: number | null;
  season_id?: number | null;
  created_at: string;
};

export type CreateMealPayload = {
  name: string;
  location?: string;
  scheduled_at?: string;
  notes?: string;
  event_id: number;
};

export const listMeals = () => apiRequest<Meal[]>('/logistics/meals');
export const getMeal = (id: number) => apiRequest<Meal>(`/logistics/meals/${id}`);
export const createMeal = (payload: CreateMealPayload) =>
  apiRequest<Meal>('/logistics/meals', { method: 'POST', body: JSON.stringify(payload) });
export const updateMeal = (id: number, payload: CreateMealPayload) =>
  apiRequest<Meal>(`/logistics/meals/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteMeal = (id: number) => apiRequest<void>(`/logistics/meals/${id}`, { method: 'DELETE' });
