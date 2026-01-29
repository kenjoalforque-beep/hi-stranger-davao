// 🔴 TEMP TEST OVERRIDE — REMOVE AFTER TESTING
if (process.env.TEST_FORCE_OPEN === "true") {
  // Force-create or force-return a room for testing
  return NextResponse.json({
    ok: true,
    room_id: "test-room-" + Date.now(),
  });
}
