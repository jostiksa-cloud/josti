const API = process.env.API_PUBLIC_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";
const PASSWORD = "Password123";
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

type Json = Record<string, unknown>;

async function call(method: string, path: string, token: string | null, json?: unknown, form?: FormData): Promise<Json> {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  let body: string | FormData | undefined;
  if (json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const response = await fetch(`${API}${path}`, { method, headers, body });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Json | Json[];
    error?: { message?: string; details?: unknown };
  };
  if (!response.ok) {
    const message = payload.error?.message ?? response.statusText;
    const details = payload.error?.details ? ` ${JSON.stringify(payload.error.details)}` : "";
    throw new Error(`${method} ${path} failed (${response.status}): ${message}${details}`);
  }
  return (payload.data ?? {}) as Json;
}

async function login(email: string, password: string) {
  const data = await call("POST", "/api/v1/auth/login", null, { email, password });
  const token = String(data.accessToken);
  const me = await call("GET", "/api/v1/auth/me", token);
  return {
    token,
    id: String(me.id),
    organizationId: me.organizationId ? String(me.organizationId) : null,
    driverId: me.driverId ? String(me.driverId) : null,
  };
}

async function register(input: Json) {
  const response = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.status === 409) return login(String(input.email), String(input.password));
  const payload = (await response.json()) as { data?: Json; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Registration failed");
  const account = payload.data?.account as Json;
  return {
    token: String(payload.data?.accessToken),
    id: String(account.id),
    organizationId: account.organizationId ? String(account.organizationId) : null,
    driverId: account.driverId ? String(account.driverId) : null,
  };
}

async function upload(token: string, docType: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set("docType", docType);
  form.set("file", new File([PNG], `${docType}.png`, { type: "image/png" }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  await call("POST", "/api/v1/documents", token, undefined, form);
}

async function approvePending(adminToken: string) {
  const docs = (await call("GET", "/api/v1/admin/documents", adminToken)) as unknown as Json[];
  const soon = new Date(Date.now() + 12 * 86400_000).toISOString().slice(0, 10);
  for (const doc of docs) {
    if (doc.status !== "pending") continue;
    await call("POST", `/api/v1/documents/${doc.id}/review`, adminToken, {
      decision: "approved",
      expiresOn: doc.docType === "insurance" ? soon : undefined,
    });
  }
}

async function activate(adminToken: string, userId: string) {
  await call("PATCH", `/api/v1/admin/users/${userId}/status`, adminToken, { status: "verified" });
  await call("PATCH", `/api/v1/admin/users/${userId}/status`, adminToken, { status: "active" });
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function ensureDemoDepth() {
  const driver = await login("driver@josti.test", PASSWORD);
  const trips = (await call("GET", "/api/v1/trips", driver.token)) as unknown as Json[];
  const live = trips.find((trip) => trip.status === "in_transit");
  if (live?.id && live.vehicleId) {
    const tracking = (await call("GET", `/api/v1/trips/${live.id}/tracking`, driver.token)) as Json;
    const points = (tracking.points as Json[] | undefined) ?? [];
    if (points.length < 4) {
      const trail = [
        [21.48, 39.19],
        [21.68, 39.72],
        [22.05, 40.35],
        [22.55, 41.2],
        [23.15, 42.35],
      ];
      for (let index = 0; index < trail.length; index += 1) {
        const [latitude, longitude] = trail[index] ?? [21.48, 39.19];
        await call("POST", "/api/v1/tracking", driver.token, {
          tripId: live.id,
          vehicleId: live.vehicleId,
          latitude,
          longitude,
          accuracyM: 18,
          recordedAt: new Date(Date.now() - (trail.length - index) * 7 * 60 * 1000).toISOString(),
        });
      }
    }
  }

  const admin = await login("admin@josti.test", "AdminPass123");
  const requests = (await call("GET", "/api/v1/admin/requests", admin.token)) as unknown as Json[];
  if (requests.some((row) => row.status === "ready_for_admin_review")) return;
  const merchant = await login("merchant@josti.test", PASSWORD);
  const broker = await login("broker@josti.test", PASSWORD);
  const created = await call("POST", "/api/v1/requests", merchant.token, {
    useDefaultBroker: true,
    portCode: "JED",
    containerNumber: "TEMU6000006",
    containerType: "40ft",
    truckType: "container_chassis",
    loadingLocation: "Jeddah Islamic Port, gate 5",
    destination: "Riyadh, north warehouse 9",
    scheduledLoadingAt: hoursFromNow(8),
    expectedDeliveryAt: hoursFromNow(36),
    instructions: "Waiting for the administrator to release this shipment.",
    proposedPrice: 1900,
  });
  const requestId = String(created.id);
  await upload(broker.token, "clearance_evidence", { requestId });
  await call("POST", `/api/v1/requests/${requestId}/clearance`, broker.token, {
    approvedPrice: 2200,
    externalPaymentConfirmed: true,
    permitsConfirmed: true,
    confirmReady: true,
    progressNote: "Ready for the administrator to release.",
  });
}

async function main() {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`API is not reachable at ${API}`);

  const admin = await login("admin@josti.test", "AdminPass123");
  const existing = (await call("GET", "/api/v1/admin/requests", admin.token)) as unknown as Json[];
  if (existing.length > 0) {
    await ensureDemoDepth();
    console.log("Demo data is already present. Tracking history was checked.");
    return;
  }

  const merchant = await register({
    email: "merchant@josti.test",
    password: PASSWORD,
    fullName: "Layla Al-Harbi",
    fullNameAr: "ليلى الحربي",
    phone: "0551000001",
    locale: "ar",
    role: "merchant",
    organization: {
      type: "merchant",
      legalName: "Gulf Retail Trading",
      legalNameAr: "تجارة الخليج للتجزئة",
      nationalAddress: "Riyadh, Al Olaya, Building 14",
      iban: "SA0380000000608010167519",
      commercialRegistration: "1010123456",
    },
  });
  const broker = await register({
    email: "broker@josti.test",
    password: PASSWORD,
    fullName: "Omar Al-Zahrani",
    fullNameAr: "عمر الزهراني",
    phone: "0551000002",
    locale: "ar",
    role: "customs_broker",
    organization: {
      type: "broker",
      legalName: "Red Sea Customs Office",
      legalNameAr: "مكتب البحر الأحمر للتخليص",
      nationalAddress: "Jeddah, Al Balad, Office 8",
      commercialRegistration: "4030123456",
      supportedPorts: ["JED", "RAB", "YAN", "DMM"],
    },
  });
  const carrier = await register({
    email: "carrier@josti.test",
    password: PASSWORD,
    fullName: "Nasser Al-Otaibi",
    fullNameAr: "ناصر العتيبي",
    phone: "0551000003",
    locale: "ar",
    role: "carrier",
    organization: {
      type: "carrier_company",
      legalName: "Najd Transport",
      legalNameAr: "شركة نجد للنقل",
      nationalAddress: "Riyadh, Second Industrial City",
      carrierKind: "company",
      serviceRegions: ["JED", "RAB", "YAN", "DMM"],
    },
  });
  const indie = await register({
    email: "indie@josti.test",
    password: PASSWORD,
    fullName: "Sami Al-Qahtani",
    fullNameAr: "سامي القحطاني",
    phone: "0551000004",
    locale: "ar",
    role: "carrier",
    organization: {
      type: "independent_carrier",
      legalName: "Sami Al-Qahtani Transport",
      legalNameAr: "نقل سامي القحطاني",
      nationalAddress: "Dammam, King Fahd Road",
      carrierKind: "independent",
      serviceRegions: ["JED", "DMM"],
    },
  });

  for (const docType of ["commercial_registration", "tax_identification", "national_address", "iban_certificate"]) {
    await upload(merchant.token, docType);
  }
  for (const docType of ["customs_clearance_license", "office_commercial_registration", "fasah_account_evidence", "broker_national_address"]) {
    await upload(broker.token, docType);
  }
  await approvePending(admin.token);
  await activate(admin.token, merchant.id);
  await activate(admin.token, broker.id);
  await activate(admin.token, carrier.id);

  const vehicleDocs = ["vehicle_registration", "vehicle_operating_card", "operating_license", "insurance", "periodic_inspection"];
  const driverDocs = ["driver_license", "residence_permit", "passport"];

  const truck = await call("POST", "/api/v1/vehicles", carrier.token, {
    plateNumber: "RUH 4821",
    truckType: "container_chassis",
    supportedContainerTypes: ["20ft", "40ft", "40ft_hc"],
  });
  const driverRow = await call("POST", "/api/v1/drivers", carrier.token, {
    email: "driver@josti.test",
    password: PASSWORD,
    fullName: "Fahad Al-Harbi",
    fullNameAr: "فهد الحربي",
    phone: "0551000005",
    licenseNumber: "DL-204488",
    licenseExpiry: "2030-06-30",
  });
  const vehicleId = String(truck.id);
  const driverId = String(driverRow.id);
  const driverUserId = String(driverRow.userId);
  for (const docType of vehicleDocs) await upload(carrier.token, docType, { vehicleId });
  for (const docType of driverDocs) await upload(carrier.token, docType, { driverId });

  const indieProfile = await login("indie@josti.test", PASSWORD);
  const indieTruck = await call("POST", "/api/v1/vehicles", indieProfile.token, {
    plateNumber: "DMM 1190",
    truckType: "flatbed",
    supportedContainerTypes: ["20ft", "40ft"],
  });
  const indieVehicleId = String(indieTruck.id);
  const indieDriverId = String(indieProfile.driverId);
  for (const docType of vehicleDocs) await upload(indieProfile.token, docType, { vehicleId: indieVehicleId });
  for (const docType of driverDocs) await upload(indieProfile.token, docType, { driverId: indieDriverId });

  await approvePending(admin.token);
  for (const [path, id] of [
    ["vehicles", vehicleId],
    ["drivers", driverId],
    ["vehicles", indieVehicleId],
    ["drivers", indieDriverId],
  ] as const) {
    await call("PATCH", `/api/v1/admin/${path}/${id}/status`, admin.token, { status: "active" });
  }
  await activate(admin.token, driverUserId);
  await activate(admin.token, indie.id);
  await call("POST", "/api/v1/assignments", carrier.token, { vehicleId, driverId });
  await call("POST", "/api/v1/assignments", indieProfile.token, { vehicleId: indieVehicleId, driverId: indieDriverId });
  await call("PATCH", `/api/v1/vehicles/${vehicleId}/availability`, carrier.token, { availability: "available" });
  await call("PATCH", `/api/v1/drivers/${driverId}/availability`, carrier.token, { availability: "available" });
  await call("PATCH", `/api/v1/vehicles/${indieVehicleId}/availability`, indieProfile.token, { availability: "available" });
  await call("PATCH", `/api/v1/drivers/${indieDriverId}/availability`, indieProfile.token, { availability: "available" });

  const merchantSession = await login("merchant@josti.test", PASSWORD);
  const brokerSession = await login("broker@josti.test", PASSWORD);
  await call("POST", "/api/v1/brokers", merchantSession.token, {
    brokerOrganizationId: broker.organizationId,
    isDefault: true,
  });

  async function openRequest(containerNumber: string, destination: string, portCode: string, price: number) {
    return call("POST", "/api/v1/requests", merchantSession.token, {
      useDefaultBroker: true,
      portCode,
      containerNumber,
      containerType: "40ft",
      truckType: portCode === "DMM" ? "flatbed" : "container_chassis",
      loadingLocation: portCode === "DMM" ? "King Abdulaziz Port, gate 2" : "Jeddah Islamic Port, gate 3",
      destination,
      scheduledLoadingAt: hoursFromNow(6),
      expectedDeliveryAt: hoursFromNow(30),
      instructions: "Call the warehouse supervisor before arrival.",
      proposedPrice: price,
    });
  }

  async function clearAndRelease(requestId: string, price: number) {
    await upload(brokerSession.token, "clearance_evidence", { requestId });
    await call("POST", `/api/v1/requests/${requestId}/clearance`, brokerSession.token, {
      approvedPrice: price,
      externalPaymentConfirmed: true,
      permitsConfirmed: true,
      confirmReady: true,
      progressNote: "Clearance completed outside JOSTI. Payment and permits confirmed.",
    });
    await call("POST", `/api/v1/requests/${requestId}/release`, admin.token, {
      notes: "Released to carriers after document review.",
    });
  }

  const clearance = await openRequest("MSCU1000001", "Riyadh, Sulay warehouse 12", "JED", 1800);

  const offered = await openRequest("TCLU2000002", "Riyadh, Second Industrial City", "DMM", 2100);
  await clearAndRelease(String(offered.id), 2400);
  await call("POST", `/api/v1/requests/${offered.id}/responses`, indieProfile.token, {
    vehicleId: indieVehicleId,
    driverId: indieDriverId,
  });

  const driver = await login("driver@josti.test", PASSWORD);
  const carrierSession = await login("carrier@josti.test", PASSWORD);

  async function confirmTrip(containerNumber: string, destination: string, price: number) {
    const request = await openRequest(containerNumber, destination, "JED", price);
    const requestId = String(request.id);
    await clearAndRelease(requestId, price + 400);
    const response = await call("POST", `/api/v1/requests/${requestId}/responses`, carrierSession.token, {
      vehicleId,
      driverId,
    });
    const trip = await call("POST", `/api/v1/requests/${requestId}/select`, merchantSession.token, {
      responseId: String(response.id),
    });
    return String(trip.id);
  }

  const closedTripId = await confirmTrip("HLCU3000003", "Riyadh, Al Aziziyah warehouse", 2600);
  for (const status of ["arrived_at_port"]) {
    await call("POST", `/api/v1/trips/${closedTripId}/transition`, driver.token, { toStatus: status });
  }
  await upload(driver.token, "loading_photo", { tripId: closedTripId });
  for (const status of ["loaded", "trip_started", "in_transit", "arrived_at_destination"]) {
    await call("POST", `/api/v1/trips/${closedTripId}/transition`, driver.token, { toStatus: status });
  }
  await upload(driver.token, "delivery_note", { tripId: closedTripId });
  await call("POST", `/api/v1/trips/${closedTripId}/transition`, driver.token, {
    toStatus: "delivered",
    recipientName: "Noura Saleh",
    deliveredAt: new Date().toISOString(),
  });
  await call("POST", `/api/v1/trips/${closedTripId}/transition`, admin.token, { toStatus: "closed" });
  await call("POST", `/api/v1/trips/${closedTripId}/ratings`, merchantSession.token, {
    tripId: closedTripId,
    targetRole: "carrier",
    score: 5,
    comment: "Arrived within the agreed window.",
  });
  await call("POST", `/api/v1/trips/${closedTripId}/incidents`, merchantSession.token, {
    tripId: closedTripId,
    incidentType: "delay",
    description: "The gate queue added about one hour. Delivery was still accepted.",
  });

  const liveTripId = await confirmTrip("OOLU4000004", "Riyadh, Al Kharj road warehouse 4", 3200);
  await call("POST", `/api/v1/trips/${liveTripId}/transition`, driver.token, { toStatus: "arrived_at_port" });
  await upload(driver.token, "loading_photo", { tripId: liveTripId });
  for (const status of ["loaded", "trip_started", "in_transit"]) {
    await call("POST", `/api/v1/trips/${liveTripId}/transition`, driver.token, { toStatus: status });
  }
  await call("POST", "/api/v1/tracking", driver.token, {
    tripId: liveTripId,
    vehicleId,
    latitude: 22.15,
    longitude: 40.42,
    accuracyM: 18,
    recordedAt: new Date().toISOString(),
  });
  const liveIncident = await call("POST", `/api/v1/trips/${liveTripId}/incidents`, driver.token, {
    tripId: liveTripId,
    incidentType: "delay",
    description: "Traffic is slow near Taif. The container is still on the truck.",
  });

  const cancelled = await openRequest("CMAU5000005", "Yanbu, industrial yard", "YAN", 1500);
  await call("POST", `/api/v1/requests/${cancelled.id}/cancel`, merchantSession.token, {
    reason: "The merchant postponed this shipment.",
  });

  await upload(merchantSession.token, "commercial_registration");

  console.log("Demo data is ready.");
  console.log(`Clearance request ${clearance.reference ?? clearance.id}`);
  console.log(`Open carrier offer ${offered.reference ?? offered.id}`);
  console.log(`Closed trip ${closedTripId}`);
  console.log(`Live trip ${liveTripId}, open incident ${liveIncident.id}`);
  console.log("Password for every demo account except the administrator: Password123");
}

await main();
