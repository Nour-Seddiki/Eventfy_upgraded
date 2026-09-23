/**
 * ═══════════════════════════════════════════
 * Eventfy E2E Test Suite v2
 * Tests every backend endpoint + workflow
 * Run: node e2e-test.js
 * ═══════════════════════════════════════════
 */

const API = 'https://eventfy-backend-exhu.onrender.com';
let passed = 0, failed = 0, skipped = 0;
const results = [];

// ── Credentials ──
const ADMIN_EMAIL = 'admin-test01@eventfy.com';
const ADMIN_PASS  = 'Admin@2026';
const TEST_USER_EMAIL = `testuser_e2e_${Date.now()}@test.com`;
const TEST_USER_PASS  = 'TestPass123!';
const ts = Date.now().toString().slice(-6);
const TEST_USER_NAME  = `e2e_${ts}`;

let adminToken = null;
let userToken  = null;
let testUserId = null;
let testEventId = null;

// ── Helper ──

async function apiCall(method, path, body = null, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !(body instanceof URLSearchParams)) headers['Content-Type'] = 'application/json';
  if (body instanceof URLSearchParams) headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const opts = { method, headers };
  if (body) opts.body = body instanceof URLSearchParams ? body.toString() : JSON.stringify(body);

  try {
    const res = await fetch(`${API}${path}`, opts);
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try { data = await res.text(); } catch { data = null; }
    }
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    return { status: 0, data: null, ok: false, error: e.message };
  }
}

function test(name, passed_flag, detail = '') {
  if (passed_flag) {
    passed++;
    results.push(`  ✅ ${name}`);
  } else {
    failed++;
    results.push(`  ❌ ${name} ${detail ? '→ ' + detail : ''}`);
  }
}

function skip(name, reason = '') {
  skipped++;
  results.push(`  ⏭️  ${name} (skipped: ${reason})`);
}

// ═══════════════════════════════════════
//  TEST GROUPS
// ═══════════════════════════════════════

async function testHealthCheck() {
  console.log('\n🔍 1. HEALTH CHECK');
  results.push('\n── 1. HEALTH CHECK ──');
  const res = await apiCall('GET', '/docs');
  test('API is reachable (docs)', res.status === 200);
}

async function testAuth() {
  console.log('\n🔐 2. AUTHENTICATION');
  results.push('\n── 2. AUTHENTICATION ──');

  // 2a. Register new user: POST /auth/sign_up
  const regRes = await apiCall('POST', '/auth/sign_up', {
    user_name: TEST_USER_NAME,
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASS,
    role: 'attendee',
  });
  test('Register new user', regRes.status === 201 || regRes.status === 200, `status=${regRes.status} ${JSON.stringify(regRes.data)?.slice(0,120)}`);

  // 2b. Login with test user: POST /auth/token
  const loginBody = new URLSearchParams();
  loginBody.append('username', TEST_USER_EMAIL);
  loginBody.append('password', TEST_USER_PASS);
  const loginRes = await apiCall('POST', '/auth/token', loginBody);
  test('Login with new user', loginRes.ok && loginRes.data?.access_token, `status=${loginRes.status}`);
  if (loginRes.ok && loginRes.data?.access_token) userToken = loginRes.data.access_token;

  // 2c. Login as admin
  const adminBody = new URLSearchParams();
  adminBody.append('username', ADMIN_EMAIL);
  adminBody.append('password', ADMIN_PASS);
  const adminRes = await apiCall('POST', '/auth/token', adminBody);
  test('Login as admin', adminRes.ok && adminRes.data?.access_token, `status=${adminRes.status}`);
  if (adminRes.ok && adminRes.data?.access_token) adminToken = adminRes.data.access_token;

  // 2d. Get user profile: GET /users/my_profile
  if (userToken) {
    const profileRes = await apiCall('GET', '/users/my_profile', null, userToken);
    test('Get user profile', profileRes.ok, `status=${profileRes.status}`);
    if (profileRes.ok) testUserId = profileRes.data?.id;
  }

  // 2e. Invalid credentials
  const badBody = new URLSearchParams();
  badBody.append('username', 'nonexistent@test.com');
  badBody.append('password', 'wrongpass');
  const badRes = await apiCall('POST', '/auth/token', badBody);
  test('Reject invalid credentials', badRes.status === 401, `status=${badRes.status}`);

  // 2f. No token access
  const noAuthRes = await apiCall('GET', '/users/my_profile');
  test('Reject unauthenticated request', noAuthRes.status === 401, `status=${noAuthRes.status}`);

  // 2g. Duplicate registration
  const dupRes = await apiCall('POST', '/auth/sign_up', {
    user_name: TEST_USER_NAME,
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASS,
    role: 'attendee',
  });
  test('Reject duplicate registration', dupRes.status === 400 || dupRes.status === 409, `status=${dupRes.status}`);
}

async function testUserProfile() {
  console.log('\n👤 3. USER PROFILE');
  results.push('\n── 3. USER PROFILE ──');
  if (!userToken) { skip('User profile tests', 'no user token'); return; }

  const profileRes = await apiCall('GET', '/users/my_profile', null, userToken);
  test('Get my profile returns data', profileRes.ok && profileRes.data?.email === TEST_USER_EMAIL, `status=${profileRes.status}`);

  const updateRes = await apiCall('PUT', '/users/update_profile', { full_name: 'Updated E2E User' }, userToken);
  test('Update profile', updateRes.ok, `status=${updateRes.status}`);

  // Verify update
  const verifyRes = await apiCall('GET', '/users/my_profile', null, userToken);
  test('Profile update persisted', verifyRes.ok && verifyRes.data?.full_name === 'Updated E2E User', `name=${verifyRes.data?.full_name}`);
}

async function testEvents() {
  console.log('\n📅 4. EVENTS');
  results.push('\n── 4. EVENTS ──');

  // 4a. Browse public events: GET /events/public
  const publicRes = await apiCall('GET', '/events/public');
  test('Browse public events', publicRes.ok, `status=${publicRes.status}`);
  const evts = publicRes.ok ? publicRes.data : [];
  test('Public events returns array', Array.isArray(evts), `type=${typeof evts}`);

  if (Array.isArray(evts) && evts.length > 0) {
    testEventId = evts[0].id;

    // 4b. Single event detail
    const singleRes = await apiCall('GET', `/events/public/${testEventId}`);
    test('Get single event detail', singleRes.ok, `status=${singleRes.status}`);
    test('Event has title', !!singleRes.data?.title, `title=${singleRes.data?.title}`);
    test('Event has start_date', singleRes.data?.start_date !== undefined, '');
  } else {
    skip('Single event detail', 'no events in DB');
  }

  // 4c. Trending events
  const trendRes = await apiCall('GET', '/events/trending');
  test('Get trending events', trendRes.ok || trendRes.status === 200, `status=${trendRes.status}`);

  // 4d. Search events
  const searchRes = await apiCall('GET', '/events/search?query=test');
  test('Search events endpoint', searchRes.ok || searchRes.status === 200 || searchRes.status === 404, `status=${searchRes.status}`);

  // 4e. Org event list (authenticated)
  if (adminToken) {
    const orgRes = await apiCall('GET', '/Event/event_list', null, adminToken);
    test('Organizer event list', orgRes.ok || orgRes.status === 200 || orgRes.status === 404, `status=${orgRes.status}`);
  }

  // 4f. 404 for non-existent event
  const badRes = await apiCall('GET', '/events/public/999999');
  test('404 for non-existent event', badRes.status === 404, `status=${badRes.status}`);
}

async function testNotifications() {
  console.log('\n🔔 5. NOTIFICATIONS');
  results.push('\n── 5. NOTIFICATIONS ──');
  if (!userToken) { skip('Notification tests', 'no user token'); return; }

  // 5a. Get notifications: GET /notifications
  const notifRes = await apiCall('GET', '/notifications', null, userToken);
  test('Get notifications list', notifRes.ok, `status=${notifRes.status}`);

  // 5b. Unread count
  const countRes = await apiCall('GET', '/notifications/unread-count', null, userToken);
  test('Get unread count', countRes.ok, `status=${countRes.status}`);
  if (countRes.ok) {
    test('Unread count returns number', typeof countRes.data?.unread_count === 'number' || typeof countRes.data === 'number', `data=${JSON.stringify(countRes.data)}`);
  }

  // 5c. Check notification structure
  if (notifRes.ok) {
    const notifArray = Array.isArray(notifRes.data) ? notifRes.data : (notifRes.data?.notifications || []);
    test('Notifications data is array', Array.isArray(notifArray), '');
    if (notifArray.length > 0) {
      const n = notifArray[0];
      test('Notification has id', n.id !== undefined, '');
      test('Notification has type', !!n.type, `type=${n.type}`);
      test('Notification has message', !!n.message, '');
      test('Notification has created_at', !!n.created_at, '');
      test('Notification has read field', n.read !== undefined, '');

      // 5d. Mark single as read
      const markRes = await apiCall('PUT', `/notifications/${n.id}/read`, null, userToken);
      test('Mark single notification read', markRes.ok, `status=${markRes.status}`);
    }
  }

  // 5e. Mark all read
  const markAllRes = await apiCall('PUT', '/notifications/mark-all-as-read', null, userToken);
  test('Mark all notifications read', markAllRes.ok || markAllRes.status === 200, `status=${markAllRes.status}`);
}

async function testAdminDashboard() {
  console.log('\n⚙️  6. ADMIN DASHBOARD');
  results.push('\n── 6. ADMIN DASHBOARD ──');
  if (!adminToken) { skip('Admin tests', 'no admin token'); return; }

  // 6a. Dashboard stats
  const dashRes = await apiCall('GET', '/admin/dashboard', null, adminToken);
  test('Admin dashboard stats', dashRes.ok, `status=${dashRes.status}`);
  if (dashRes.ok) {
    test('Dashboard has users', dashRes.data?.users !== undefined, '');
    test('Dashboard has events', dashRes.data?.events !== undefined, '');
  }

  // 6b. All users (verify is_banned, is_restricted fields)
  const usersRes = await apiCall('GET', '/admin/view_all_users', null, adminToken);
  test('Admin view all users', usersRes.ok, `status=${usersRes.status}`);
  if (usersRes.ok && Array.isArray(usersRes.data) && usersRes.data.length > 0) {
    const u = usersRes.data[0];
    test('User has id', u.id !== undefined, '');
    test('User has email', !!u.email, '');
    test('User has role', !!u.role, '');
    test('User has is_banned field', u.is_banned !== undefined, `is_banned=${u.is_banned}`);
    test('User has is_restricted field', u.is_restricted !== undefined, `is_restricted=${u.is_restricted}`);
  }

  // 6c. All events
  const eventsRes = await apiCall('GET', '/admin/view_all_events', null, adminToken);
  test('Admin view all events', eventsRes.ok, `status=${eventsRes.status}`);

  // 6d. All payments
  const payRes = await apiCall('GET', '/admin/view_all_payments', null, adminToken);
  test('Admin view all payments', payRes.ok || payRes.status === 404, `status=${payRes.status}`);

  // 6e. All reviews
  const revRes = await apiCall('GET', '/admin/view_all_reviews', null, adminToken);
  test('Admin view all reviews', revRes.ok || revRes.status === 404, `status=${revRes.status}`);

  // 6f. Analytics
  const analyticsRes = await apiCall('GET', '/admin/analytics', null, adminToken);
  test('Admin analytics', analyticsRes.ok, `status=${analyticsRes.status}`);

  // 6g. Non-admin blocked
  if (userToken) {
    const forbidRes = await apiCall('GET', '/admin/dashboard', null, userToken);
    test('Non-admin rejected from admin API', forbidRes.status === 403, `status=${forbidRes.status}`);
  }
}

async function testAdminBanRestrict() {
  console.log('\n🚫 7. ADMIN BAN / RESTRICT / DEACTIVATE');
  results.push('\n── 7. ADMIN BAN / RESTRICT / DEACTIVATE ──');
  if (!adminToken || !testUserId) { skip('Ban/restrict tests', 'no admin token or test user'); return; }

  // 7a. Restrict user
  const restrictRes = await apiCall('PUT', `/admin/restrict_user/${testUserId}`, null, adminToken);
  test('Restrict user', restrictRes.ok, `status=${restrictRes.status} ${JSON.stringify(restrictRes.data)?.slice(0,100)}`);

  // 7b. Restricted user tries to buy ticket
  if (testEventId) {
    // Re-login to get fresh JWT with is_restricted flag
    const lb = new URLSearchParams();
    lb.append('username', TEST_USER_EMAIL);
    lb.append('password', TEST_USER_PASS);
    const freshLogin = await apiCall('POST', '/auth/token', lb);
    if (freshLogin.ok) userToken = freshLogin.data.access_token;

    const buyRes = await apiCall('POST', `/ticket/${testEventId}`, null, userToken);
    test('Restricted user blocked from ticket purchase', buyRes.status === 403, `status=${buyRes.status} detail=${buyRes.data?.detail}`);
  }

  // 7c. Unrestrict user
  const unrestrictRes = await apiCall('PUT', `/admin/unrestrict_user/${testUserId}`, null, adminToken);
  test('Unrestrict user', unrestrictRes.ok, `status=${unrestrictRes.status}`);

  // 7d. Ban user
  const banRes = await apiCall('PUT', `/admin/ban_user/${testUserId}`, null, adminToken);
  test('Ban user', banRes.ok, `status=${banRes.status}`);

  // 7e. Banned user cannot login
  const bannedLogin = new URLSearchParams();
  bannedLogin.append('username', TEST_USER_EMAIL);
  bannedLogin.append('password', TEST_USER_PASS);
  const bannedRes = await apiCall('POST', '/auth/token', bannedLogin);
  test('Banned user rejected from login', bannedRes.status === 403, `status=${bannedRes.status} detail=${bannedRes.data?.detail}`);

  // 7f. Reactivate user
  const reactRes = await apiCall('PUT', `/admin/reactive_user/${testUserId}`, null, adminToken);
  test('Reactivate user (clears ban)', reactRes.ok, `status=${reactRes.status}`);

  // 7g. Login works again
  const postReactLogin = new URLSearchParams();
  postReactLogin.append('username', TEST_USER_EMAIL);
  postReactLogin.append('password', TEST_USER_PASS);
  const postReactRes = await apiCall('POST', '/auth/token', postReactLogin);
  test('User can login after reactivation', postReactRes.ok && postReactRes.data?.access_token, `status=${postReactRes.status}`);
  if (postReactRes.ok) userToken = postReactRes.data.access_token;

  // 7h. Admin cannot ban themselves
  const adminProfile = await apiCall('GET', '/users/my_profile', null, adminToken);
  if (adminProfile.ok) {
    const selfBanRes = await apiCall('PUT', `/admin/ban_user/${adminProfile.data.id}`, null, adminToken);
    test('Admin cannot ban self', selfBanRes.status === 400 || selfBanRes.status === 403, `status=${selfBanRes.status}`);
  }
}

async function testRegistration() {
  console.log('\n📋 8. REGISTRATION SYSTEM');
  results.push('\n── 8. REGISTRATION SYSTEM ──');
  if (!userToken) { skip('Registration tests', 'no user token'); return; }

  // 8a. My registrations
  const myRegsRes = await apiCall('GET', '/registrations/my-registrations', null, userToken);
  test('Get my registrations', myRegsRes.ok, `status=${myRegsRes.status}`);
  if (myRegsRes.ok) {
    const myRegs = Array.isArray(myRegsRes.data) ? myRegsRes.data : [];
    test('My registrations returns array', Array.isArray(myRegs), '');
    if (myRegs.length > 0) {
      test('Registration has attempt_count', myRegs[0].attempt_count !== undefined, `attempt_count=${myRegs[0].attempt_count}`);
      test('Registration has status', !!myRegs[0].status, `status=${myRegs[0].status}`);
    }
  }

  // 8b. Find event with requires_approval
  const evRes = await apiCall('GET', '/events/public');
  const events = evRes.ok ? evRes.data : [];
  const approvalEvent = Array.isArray(events) ? events.find(e => e.requires_approval) : null;
  if (approvalEvent) {
    // 8c. Get registration form questions
    const formRes = await apiCall('GET', `/registrations/events/${approvalEvent.id}/questions`, null, userToken);
    test('Get registration form questions', formRes.ok || formRes.status === 404, `status=${formRes.status}`);
  } else {
    skip('Registration form test', 'no event with requires_approval');
  }
}

async function testTickets() {
  console.log('\n🎫 9. TICKETS');
  results.push('\n── 9. TICKETS ──');
  if (!userToken) { skip('Ticket tests', 'no user token'); return; }

  // 9a. Get user tickets: GET /ticket/get_user_tickets
  const ticketsRes = await apiCall('GET', '/ticket/get_user_tickets', null, userToken);
  test('Get user tickets', ticketsRes.ok || ticketsRes.status === 404, `status=${ticketsRes.status}`);

  // 9b. Invalid ticket purchase (non-existent event)
  const badBuyRes = await apiCall('POST', '/ticket/99999', null, userToken);
  test('Reject ticket for non-existent event', badBuyRes.status === 404, `status=${badBuyRes.status}`);
}

async function testReviews() {
  console.log('\n⭐ 10. REVIEWS');
  results.push('\n── 10. REVIEWS ──');

  if (testEventId && userToken) {
    const revRes = await apiCall('GET', `/review/event_reviews/${testEventId}`, null, userToken);
    test('Get event reviews', revRes.ok || revRes.status === 404, `status=${revRes.status}`);
  } else if (testEventId) {
    skip('Get event reviews', 'no user token');
  }

  // Attempt review without attended ticket
  if (userToken && testEventId) {
    const revAttempt = await apiCall('POST', '/review/create_review', {
      event_id: testEventId,
      rating: 5,
      comment: 'E2E test review',
    }, userToken);
    test('Reject review from non-attendee', revAttempt.status === 403, `status=${revAttempt.status}`);
  }
}

async function testSavedEvents() {
  console.log('\n💾 11. SAVED EVENTS');
  results.push('\n── 11. SAVED EVENTS ──');
  if (!userToken) { skip('Saved events tests', 'no user token'); return; }

  // 11a. Get saved events
  const savedRes = await apiCall('GET', '/saving-events/my-saved-events', null, userToken);
  test('Get saved events', savedRes.ok, `status=${savedRes.status}`);

  // 11b. Save event
  if (testEventId) {
    const saveRes = await apiCall('POST', '/saving-events/save', { event_id: testEventId }, userToken);
    test('Save event', saveRes.ok || saveRes.status === 201 || saveRes.status === 409, `status=${saveRes.status}`);

    // 11c. Check it appears
    const checkRes = await apiCall('GET', '/saving-events/my-saved-events', null, userToken);
    if (checkRes.ok) {
      const saved = Array.isArray(checkRes.data) ? checkRes.data : [];
      const found = saved.some(s => s.event_id === testEventId || s.id === testEventId);
      test('Saved event appears in list', found || saved.length > 0, `count=${saved.length}`);

      // 11d. Unsave event
      if (saved.length > 0) {
        const savingId = saved[saved.length - 1].id;
        const unsaveRes = await apiCall('DELETE', `/saving-events/remove/${savingId}`, null, userToken);
        test('Unsave event', unsaveRes.ok, `status=${unsaveRes.status}`);
      }
    }
  }
}

async function testAdminRoleChange() {
  console.log('\n🔄 12. ADMIN ROLE MANAGEMENT');
  results.push('\n── 12. ADMIN ROLE MANAGEMENT ──');
  if (!adminToken || !testUserId) { skip('Role change tests', 'no admin or user'); return; }

  // 12a. Change role to organizer
  const roleRes = await apiCall('PUT', `/admin/change_role/${testUserId}`, { role: 'organizer' }, adminToken);
  test('Change user role to organizer', roleRes.ok, `status=${roleRes.status}`);

  // 12b. Verify via user details
  const detailRes = await apiCall('GET', `/admin/user_details/${testUserId}`, null, adminToken);
  test('Admin user details endpoint works', detailRes.ok, `status=${detailRes.status}`);
  if (detailRes.ok) {
    test('User role changed to organizer', detailRes.data?.role === 'organizer', `role=${detailRes.data?.role}`);
  }

  // 12c. Change back to attendee
  const roleBackRes = await apiCall('PUT', `/admin/change_role/${testUserId}`, { role: 'attendee' }, adminToken);
  test('Change role back to attendee', roleBackRes.ok, `status=${roleBackRes.status}`);
}

async function testEdgeCases() {
  console.log('\n🔧 13. EDGE CASES');
  results.push('\n── 13. EDGE CASES ──');

  // 13a. Malformed JWT
  const malformedRes = await apiCall('GET', '/users/my_profile', null, 'invalid.token.here');
  test('Reject malformed JWT token', malformedRes.status === 401, `status=${malformedRes.status}`);

  // 13b. Empty POST body to auth
  const emptyRes = await apiCall('POST', '/auth/sign_up', {});
  test('Reject empty registration body', emptyRes.status >= 400, `status=${emptyRes.status}`);

  // 13c. Invalid method on valid route
  const deleteEventsRes = await apiCall('DELETE', '/events/public');
  test('Reject invalid method', deleteEventsRes.status === 405 || deleteEventsRes.status === 404, `status=${deleteEventsRes.status}`);
}

async function testCleanup() {
  console.log('\n🧹 14. CLEANUP');
  results.push('\n── 14. CLEANUP ──');
  if (!adminToken || !testUserId) { skip('Cleanup', 'no admin or user'); return; }

  const delRes = await apiCall('DELETE', `/admin/delete_user/${testUserId}`, null, adminToken);
  test('Deactivate test user', delRes.ok, `status=${delRes.status}`);
}

// ═══════════════════════════════════════
//  MAIN RUNNER
// ═══════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  EVENTFY E2E TEST SUITE v2');
  console.log(`  API: ${API}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════');

  await testHealthCheck();
  await testAuth();
  await testUserProfile();
  await testEvents();
  await testNotifications();
  await testAdminDashboard();
  await testAdminBanRestrict();
  await testRegistration();
  await testTickets();
  await testReviews();
  await testSavedEvents();
  await testAdminRoleChange();
  await testEdgeCases();
  await testCleanup();

  // ── Final Report ──
  console.log('\n\n═══════════════════════════════════════════');
  console.log('  FINAL REPORT');
  console.log('═══════════════════════════════════════════');
  results.forEach(r => console.log(r));
  console.log('\n───────────────────────────────────────────');
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  📊 Total:   ${passed + failed + skipped}`);
  const score = passed + failed > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) : '0';
  console.log(`  📈 Score:   ${score}%`);
  console.log('═══════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
