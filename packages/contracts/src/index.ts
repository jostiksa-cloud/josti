import { z } from "zod/v3";

export const ROLES = ["merchant", "customs_broker", "carrier", "driver", "administrator"] as const;
export const ACCOUNT_STATUSES = [
  "pending_verification",
  "verified",
  "active",
  "needs_update",
  "suspended",
] as const;
export const ADMIN_PERMISSIONS = ["verification", "operations", "finance", "general"] as const;
export const ORG_TYPES = ["merchant", "broker", "carrier_company", "independent_carrier"] as const;
export const AVAILABILITY = ["available", "waiting", "on_trip", "unavailable"] as const;
export const PORT_CODES = ["JED", "RAB", "YAN", "DMM"] as const;
export const CONTAINER_TYPES = [
  "20ft",
  "40ft",
  "40ft_hc",
  "45ft",
  "reefer_20",
  "reefer_40",
] as const;
export const TRUCK_TYPES = [
  "flatbed",
  "lowbed",
  "side_loader",
  "container_chassis",
  "reefer",
] as const;

export const REQUEST_STATUSES = [
  "new_request",
  "customs_clearance",
  "returned_for_correction",
  "ready_for_admin_review",
  "released_to_carriers",
  "candidate_responses",
  "carrier_selected",
  "trip_confirmed",
  "cancelled",
] as const;

export const TRIP_STATUSES = [
  "en_route_to_port",
  "arrived_at_port",
  "loaded",
  "trip_started",
  "in_transit",
  "arrived_at_destination",
  "delivered",
  "closed",
] as const;

export const DOCUMENT_TYPES = [
  "commercial_registration",
  "tax_identification",
  "national_address",
  "iban_certificate",
  "business_mobile_evidence",
  "customs_clearance_license",
  "office_commercial_registration",
  "fasah_account_evidence",
  "broker_national_address",
  "vehicle_registration",
  "driver_license",
  "residence_permit",
  "passport",
  "vehicle_operating_card",
  "operating_license",
  "insurance",
  "periodic_inspection",
  "clearance_evidence",
  "loading_photo",
  "delivery_note",
  "incident_attachment",
] as const;

export const DOCUMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_update",
  "replaced",
] as const;
export const FEE_STATUSES = ["pending", "settled", "exempt", "waived"] as const;
export const INCIDENT_STATUSES = ["open", "under_review", "resolved", "dismissed"] as const;
export const INCIDENT_TYPES = [
  "delay",
  "damage",
  "documentation",
  "safety",
  "no_show",
  "other",
] as const;
export const RESPONSE_STATUSES = ["candidate", "withdrawn", "selected", "not_selected"] as const;
export const LOCALES = ["ar", "en"] as const;

export const roleSchema = z.enum(ROLES);
export const localeSchema = z.enum(LOCALES);
export const accountStatusSchema = z.enum(ACCOUNT_STATUSES);
export const adminPermissionSchema = z.enum(ADMIN_PERMISSIONS);
export const portCodeSchema = z.enum(PORT_CODES);
export const containerTypeSchema = z.enum(CONTAINER_TYPES);
export const truckTypeSchema = z.enum(TRUCK_TYPES);
export const availabilitySchema = z.enum(AVAILABILITY);
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const tripStatusSchema = z.enum(TRIP_STATUSES);
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const incidentTypeSchema = z.enum(INCIDENT_TYPES);

export const MERCHANT_REQUIRED_DOCS = [
  "commercial_registration",
  "tax_identification",
  "national_address",
  "iban_certificate",
] as const;

export const BROKER_REQUIRED_DOCS = [
  "customs_clearance_license",
  "office_commercial_registration",
  "fasah_account_evidence",
  "broker_national_address",
] as const;

export const VEHICLE_REQUIRED_DOCS = [
  "vehicle_registration",
  "vehicle_operating_card",
  "operating_license",
  "insurance",
  "periodic_inspection",
] as const;

export const DRIVER_REQUIRED_DOCS = ["driver_license", "residence_permit", "passport"] as const;

export const TRIP_TRANSITIONS: Record<
  (typeof TRIP_STATUSES)[number],
  (typeof TRIP_STATUSES)[number] | null
> = {
  en_route_to_port: "arrived_at_port",
  arrived_at_port: "loaded",
  loaded: "trip_started",
  trip_started: "in_transit",
  in_transit: "arrived_at_destination",
  arrived_at_destination: "delivered",
  delivered: "closed",
  closed: null,
};

export const passwordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, "lowercase")
  .regex(/[A-Z]/, "uppercase")
  .regex(/[0-9]/, "digit");

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
  fullName: z.string().min(2).max(160),
  fullNameAr: z.string().max(160).optional(),
  phone: z.string().min(8).max(20),
  locale: localeSchema.default("ar"),
  role: z.enum(["merchant", "customs_broker", "carrier", "driver"]),
  organization: z.object({
    type: z.enum(ORG_TYPES),
    legalName: z.string().min(2).max(200),
    legalNameAr: z.string().max(200).optional(),
    commercialRegistration: z.string().max(64).optional(),
    taxId: z.string().max(64).optional(),
    nationalAddress: z.string().max(300).optional(),
    iban: z
      .string()
      .regex(/^SA\d{22}$/i)
      .optional(),
    supportedPorts: z.array(portCodeSchema).optional(),
    serviceRegions: z.array(portCodeSchema).optional(),
    carrierKind: z.enum(["company", "independent"]).optional(),
    existingOrganizationId: z.string().uuid().optional(),
    joinCode: z.string().min(6).max(64).optional(),
  }),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});

export const createRequestSchema = z.object({
  brokerOrganizationId: z.string().uuid().optional(),
  useDefaultBroker: z.boolean().default(false),
  portCode: portCodeSchema,
  containerNumber: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[A-Za-z]{4}\d{7}$/, "ISO container number"),
  containerType: containerTypeSchema,
  truckType: truckTypeSchema,
  loadingLocation: z.string().min(3).max(300),
  destination: z.string().min(3).max(300),
  scheduledLoadingAt: z.string().datetime(),
  expectedDeliveryAt: z.string().datetime(),
  instructions: z.string().max(2000).optional(),
  proposedPrice: z.number().positive().max(1_000_000).optional(),
});

export const updateRequestSchema = createRequestSchema.partial().omit({
  useDefaultBroker: true,
  brokerOrganizationId: true,
});

export const brokerClearanceSchema = z.object({
  progressNote: z.string().max(2000).optional(),
  approvedPrice: z.number().positive().max(1_000_000).optional(),
  externalPaymentConfirmed: z.boolean().optional(),
  permitsConfirmed: z.boolean().optional(),
  confirmReady: z.boolean().optional(),
  returnForCorrection: z.boolean().optional(),
  returnReason: z.string().max(1000).optional(),
});

export const releaseRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const carrierRespondSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
});

export const selectCarrierSchema = z.object({
  responseId: z.string().uuid(),
});

export const tripTransitionSchema = z.object({
  toStatus: tripStatusSchema,
  reason: z.string().max(500).optional(),
  recipientName: z.string().min(2).max(160).optional(),
  deliveredAt: z.string().datetime().optional(),
});

export const locationUpdateSchema = z.object({
  tripId: z.string().uuid().optional(),
  vehicleId: z.string().uuid(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracyM: z.number().positive().max(5000).optional(),
  recordedAt: z.string().datetime(),
  availability: availabilitySchema.optional(),
});

export const ratingSchema = z.object({
  tripId: z.string().uuid(),
  targetRole: z.enum(["carrier", "merchant", "customs_broker"]),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const incidentSchema = z.object({
  tripId: z.string().uuid(),
  incidentType: incidentTypeSchema,
  description: z.string().min(5).max(4000),
});

export const incidentResolveSchema = z.object({
  status: z.enum(["under_review", "resolved", "dismissed"]),
  resolution: z.string().max(4000).optional(),
});

export const vehicleSchema = z.object({
  plateNumber: z.string().min(3).max(20),
  truckType: truckTypeSchema,
  supportedContainerTypes: z.array(containerTypeSchema).min(1),
  registrationExpiry: z.string().date().optional(),
  insuranceExpiry: z.string().date().optional(),
  inspectionExpiry: z.string().date().optional(),
  operatingCardExpiry: z.string().date().optional(),
});

export const driverCreateSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  fullName: z.string().min(2).max(160),
  fullNameAr: z.string().max(160).optional(),
  phone: z.string().min(8).max(20),
  licenseNumber: z.string().min(3).max(40),
  licenseExpiry: z.string().date(),
});

export const availabilityPatchSchema = z.object({
  availability: availabilitySchema,
});

export const reviewDocumentSchema = z.object({
  decision: z.enum(["approved", "rejected", "needs_update"]),
  notes: z.string().max(2000).optional(),
  expiresOn: z.string().date().optional(),
});

export const accountActionSchema = z.object({
  status: accountStatusSchema,
  reason: z.string().max(1000).optional(),
});

export const adminPermissionsSchema = z.object({
  permissions: z.array(adminPermissionSchema),
});

export const feePolicySchema = z.object({
  amount: z.number().nonnegative().max(100000),
  currency: z.literal("SAR").default("SAR"),
  freePeriodActive: z.boolean(),
  freePeriodStartsOn: z.string().date().nullable().optional(),
  freePeriodEndsOn: z.string().date().nullable().optional(),
  freePeriodEligibility: z.enum(["all_completed_trips", "none"]).nullable().optional(),
});

export const settlementSchema = z.object({
  externalReference: z.string().min(2).max(120),
  notes: z.string().max(1000).optional(),
  settledAt: z.string().datetime().optional(),
});

export const pushTokenSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  token: z.string().min(10).max(4096),
});

export const merchantBrokerLinkSchema = z.object({
  brokerOrganizationId: z.string().uuid(),
  isDefault: z.boolean().default(false),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(120).optional(),
  status: z.string().max(64).optional(),
});

export const profilePatchSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  fullNameAr: z.string().max(160).optional(),
  phone: z.string().min(8).max(20).optional(),
  locale: localeSchema.optional(),
  legalName: z.string().min(2).max(200).optional(),
  legalNameAr: z.string().max(200).optional(),
  commercialRegistration: z.string().max(64).optional(),
  taxId: z.string().max(64).optional(),
  nationalAddress: z.string().max(300).optional(),
  iban: z
    .string()
    .regex(/^SA\d{22}$/i)
    .optional(),
  supportedPorts: z.array(portCodeSchema).optional(),
  serviceRegions: z.array(portCodeSchema).optional(),
});

export type Role = z.infer<typeof roleSchema>;
export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type AdminPermission = z.infer<typeof adminPermissionSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type TripStatus = (typeof TRIP_STATUSES)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const COMPATIBILITY: Record<
  (typeof TRUCK_TYPES)[number],
  (typeof CONTAINER_TYPES)[number][]
> = {
  flatbed: ["20ft", "40ft", "40ft_hc"],
  lowbed: ["20ft", "40ft", "40ft_hc", "45ft"],
  side_loader: ["20ft", "40ft", "40ft_hc"],
  container_chassis: ["20ft", "40ft", "40ft_hc", "45ft"],
  reefer: ["reefer_20", "reefer_40"],
};

export function isCompatible(truck: string, container: string): boolean {
  const list = COMPATIBILITY[truck as keyof typeof COMPATIBILITY];
  return !!list?.includes(container as (typeof CONTAINER_TYPES)[number]);
}
