const request = require('supertest');
const mongoose = require('mongoose');
const { app, server } = require('../server');
const User = require('../models/User');
const Availability = require('../models/Availability');
const Appointment = require('../models/Appointment');

// Test database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/appointment_system_test';

describe('College Appointment System E2E Test', () => {
  let studentA1Token, studentA2Token, professorP1Token;
  let studentA1Id, studentA2Id, professorP1Id;
  let availabilityT1Id, availabilityT2Id;
  let appointmentT1Id, appointmentT2Id;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  beforeEach(async () => {
    // Clean database before each test
    await User.deleteMany({});
    await Availability.deleteMany({});
    await Appointment.deleteMany({});
  });

  afterAll(async () => {
    // Clean up and close connections
    await User.deleteMany({});
    await Availability.deleteMany({});
    await Appointment.deleteMany({});
    await mongoose.connection.close();
    server.close();
  });

  test('Complete E2E User Flow for College Appointment System', async () => {
    console.log('🚀 Starting E2E Test for College Appointment System...\n');

    // Step 1: Student A1 authenticates to access the system
    console.log('Step 1: Student A1 authentication...');
    const studentA1Registration = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Student A1',
        email: 'student.a1@college.edu',
        password: 'password123',
        role: 'student'
      });

    expect(studentA1Registration.status).toBe(201);
    expect(studentA1Registration.body.success).toBe(true);
    studentA1Token = studentA1Registration.body.data.token;
    studentA1Id = studentA1Registration.body.data.user._id;
    console.log('✅ Student A1 registered and authenticated successfully');

    // Step 2: Professor P1 authenticates to access the system
    console.log('\nStep 2: Professor P1 authentication...');
    const professorP1Registration = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Professor P1',
        email: 'professor.p1@college.edu',
        password: 'password123',
        role: 'professor',
        department: 'Computer Science'
      });

    expect(professorP1Registration.status).toBe(201);
    expect(professorP1Registration.body.success).toBe(true);
    professorP1Token = professorP1Registration.body.data.token;
    professorP1Id = professorP1Registration.body.data.user._id;
    console.log('✅ Professor P1 registered and authenticated successfully');

    // Step 3: Professor P1 specifies time slots for appointments
    console.log('\nStep 3: Professor P1 creating availability slots...');
    
    // Create time slot T1 (today + 1 day, 10:00-11:00)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().split('T')[0];

    const availabilityT1 = await request(app)
      .post('/api/availability')
      .set('Authorization', `Bearer ${professorP1Token}`)
      .send({
        date: tomorrowISO,
        startTime: '10:00',
        endTime: '11:00'
      });

    expect(availabilityT1.status).toBe(201);
    expect(availabilityT1.body.success).toBe(true);
    availabilityT1Id = availabilityT1.body.data._id;
    console.log('✅ Time slot T1 (10:00-11:00) created successfully');

    // Create time slot T2 (today + 1 day, 14:00-15:00)
    const availabilityT2 = await request(app)
      .post('/api/availability')
      .set('Authorization', `Bearer ${professorP1Token}`)
      .send({
        date: tomorrowISO,
        startTime: '14:00',
        endTime: '15:00'
      });

    expect(availabilityT2.status).toBe(201);
    expect(availabilityT2.body.success).toBe(true);
    availabilityT2Id = availabilityT2.body.data._id;
    console.log('✅ Time slot T2 (14:00-15:00) created successfully');

    // Step 4: Student A1 views available time slots for Professor P1
    console.log('\nStep 4: Student A1 viewing available slots for Professor P1...');
    const availableSlots = await request(app)
      .get(`/api/availability/professor/${professorP1Id}`)
      .set('Authorization', `Bearer ${studentA1Token}`);

    expect(availableSlots.status).toBe(200);
    expect(availableSlots.body.success).toBe(true);
    expect(availableSlots.body.data).toHaveLength(2);
    console.log('✅ Student A1 can view 2 available time slots');

    // Step 5: Student A1 books appointment with Professor P1 for time T1
    console.log('\nStep 5: Student A1 booking appointment for time T1...');
    const bookingT1 = await request(app)
      .post('/api/appointments/book')
      .set('Authorization', `Bearer ${studentA1Token}`)
      .send({
        availabilityId: availabilityT1Id,
        notes: 'Discuss final project requirements'
      });

    expect(bookingT1.status).toBe(201);
    expect(bookingT1.body.success).toBe(true);
    appointmentT1Id = bookingT1.body.data._id;
    console.log('✅ Student A1 successfully booked appointment for time T1');

    // Step 6: Student A2 authenticates to access the system
    console.log('\nStep 6: Student A2 authentication...');
    const studentA2Registration = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Student A2',
        email: 'student.a2@college.edu',
        password: 'password123',
        role: 'student'
      });

    expect(studentA2Registration.status).toBe(201);
    expect(studentA2Registration.body.success).toBe(true);
    studentA2Token = studentA2Registration.body.data.token;
    studentA2Id = studentA2Registration.body.data.user._id;
    console.log('✅ Student A2 registered and authenticated successfully');

    // Step 7: Student A2 books appointment with Professor P1 for time T2
    console.log('\nStep 7: Student A2 booking appointment for time T2...');
    const bookingT2 = await request(app)
      .post('/api/appointments/book')
      .set('Authorization', `Bearer ${studentA2Token}`)
      .send({
        availabilityId: availabilityT2Id,
        notes: 'Review research proposal'
      });

    expect(bookingT2.status).toBe(201);
    expect(bookingT2.body.success).toBe(true);
    appointmentT2Id = bookingT2.body.data._id;
    console.log('✅ Student A2 successfully booked appointment for time T2');

    // Verify both appointments exist
    const professorAppointments = await request(app)
      .get('/api/appointments/professor-appointments')
      .set('Authorization', `Bearer ${professorP1Token}`);

    expect(professorAppointments.status).toBe(200);
    expect(professorAppointments.body.data).toHaveLength(2);
    console.log('✅ Professor P1 now has 2 appointments');

    // Step 8: Professor P1 cancels the appointment with Student A1
    console.log('\nStep 8: Professor P1 cancelling appointment with Student A1...');
    const cancelAppointment = await request(app)
      .put(`/api/appointments/cancel/${appointmentT1Id}`)
      .set('Authorization', `Bearer ${professorP1Token}`);

    expect(cancelAppointment.status).toBe(200);
    expect(cancelAppointment.body.success).toBe(true);
    expect(cancelAppointment.body.data.status).toBe('cancelled');
    console.log('✅ Professor P1 successfully cancelled appointment with Student A1');

    // Step 9: Student A1 checks their appointments
    console.log('\nStep 9: Student A1 checking their appointments...');
    const studentA1Appointments = await request(app)
      .get('/api/appointments/my-appointments')
      .set('Authorization', `Bearer ${studentA1Token}`)
      .query({ status: 'confirmed' }); // Only confirmed appointments

    expect(studentA1Appointments.status).toBe(200);
    expect(studentA1Appointments.body.success).toBe(true);
    expect(studentA1Appointments.body.data).toHaveLength(0);
    console.log('✅ Student A1 has no pending confirmed appointments');

    // Additional verification: Check all appointments (including cancelled)
    const allStudentA1Appointments = await request(app)
      .get('/api/appointments/my-appointments')
      .set('Authorization', `Bearer ${studentA1Token}`);

    expect(allStudentA1Appointments.status).toBe(200);
    expect(allStudentA1Appointments.body.data).toHaveLength(1);
    expect(allStudentA1Appointments.body.data[0].status).toBe('cancelled');
    console.log('✅ Student A1 has 1 cancelled appointment (as expected)');

    // Verify Student A2 still has their appointment
    const studentA2Appointments = await request(app)
      .get('/api/appointments/my-appointments')
      .set('Authorization', `Bearer ${studentA2Token}`)
      .query({ status: 'confirmed' });

    expect(studentA2Appointments.status).toBe(200);
    expect(studentA2Appointments.body.data).toHaveLength(1);
    console.log('✅ Student A2 still has 1 confirmed appointment');

    // Verify availability slot T1 is now free again
    const updatedAvailableSlots = await request(app)
      .get(`/api/availability/professor/${professorP1Id}`)
      .set('Authorization', `Bearer ${studentA1Token}`);

    expect(updatedAvailableSlots.status).toBe(200);
    const freeSlots = updatedAvailableSlots.body.data;
    expect(freeSlots).toHaveLength(1); // T1 should be free again, T2 should be booked
    expect(freeSlots[0].startTime).toBe('10:00');
    console.log('✅ Time slot T1 is available again after cancellation');

    console.log('\n🎉 All E2E test steps completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('✅ Student A1 authentication');
    console.log('✅ Professor P1 authentication');
    console.log('✅ Professor P1 created availability slots');
    console.log('✅ Student A1 viewed available slots');
    console.log('✅ Student A1 booked appointment (T1)');
    console.log('✅ Student A2 authentication');
    console.log('✅ Student A2 booked appointment (T2)');
    console.log('✅ Professor P1 cancelled appointment with Student A1');
    console.log('✅ Student A1 verified no pending appointments');
    console.log('✅ System integrity maintained throughout the flow');
  });

  test('Additional API Validation Tests', async () => {
    console.log('\n🔍 Running additional validation tests...');

    // Test authentication requirements
    const unauthenticatedRequest = await request(app)
      .get('/api/appointments/my-appointments');
    
    expect(unauthenticatedRequest.status).toBe(401);
    console.log('✅ Unauthenticated requests properly rejected');

    // Test invalid user registration
    const invalidRegistration = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test',
        email: 'invalid-email',
        password: '123', // Too short
        role: 'invalid-role'
      });

    expect(invalidRegistration.status).toBe(400);
    console.log('✅ Invalid registration data properly validated');

    // Test authorization (student trying to create availability)
    const studentRegistration = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Student',
        email: 'test.student@college.edu',
        password: 'password123',
        role: 'student'
      });

    const unauthorizedRequest = await request(app)
      .post('/api/availability')
      .set('Authorization', `Bearer ${studentRegistration.body.data.token}`)
      .send({
        date: '2024-01-15',
        startTime: '10:00',
        endTime: '11:00'
      });

    expect(unauthorizedRequest.status).toBe(403);
    console.log('✅ Role-based authorization working correctly');

    console.log('✅ All validation tests passed!');
  });
});