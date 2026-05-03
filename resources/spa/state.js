// Shared mutable state — semua modul import object ini
// Object property bisa dimutasi dari modul manapun (no ES module binding issue)
export const state = {
  // Auth
  authToken:        null,
  authUser:         null,

  // Picker / personal view
  selectedEmployee: null,   // { pin, nama }
  pegawaiList:      [],     // [{ pin, nama, ... }]
  currentMonth:     new Date().toISOString().slice(0, 7), // YYYY-MM

  // Settings
  appShifts:        [],
  empShifts:        {},
  appHolidays:      [],
  dailyOverrides:   [],

  // Filter & Cari
  lastFilterData:   [],

  // Override picker
  ovSelectedPins:   [],

  // Inject modal
  injPin:           null,
  injTanggal:       null,

  // Polling
  prevTotal:        0,
  pollOnline:       false,
};
