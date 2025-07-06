const express = require('express');
const { body, validationResult } = require('express-validator');
const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Book an appointment (Student only)
router.post('/book', [
  auth,
  authorize('student'),
  body('availabilityId').isMongoId().withMessage('Please provide a valid availability ID'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { availabilityId, notes = '' } = req.body;

    // Find the availability slot
    const availability = await Availability.findById(availabilityId)
      .populate('professor', 'name email');

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability slot not found'
      });
    }

    if (availability.isBooked) {
      return res.status(400).json({
        success: false,
        message: 'This time slot is already booked'
      });
    }

    // Check if the slot is in the future
    const slotDateTime = new Date(availability.date);
    if (slotDateTime < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot book past time slots'
      });
    }

    // Create the appointment
    const appointment = new Appointment({
      student: req.user._id,
      professor: availability.professor._id,
      availability: availabilityId,
      date: availability.date,
      startTime: availability.startTime,
      endTime: availability.endTime,
      notes
    });

    await appointment.save();

    // Mark the availability slot as booked
    availability.isBooked = true;
    availability.bookedBy = req.user._id;
    await availability.save();

    // Populate the appointment data
    await appointment.populate([
      { path: 'student', select: 'name email' },
      { path: 'professor', select: 'name email department' },
      { path: 'availability' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: appointment
    });
  } catch (error) {
    console.error('Book appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error booking appointment'
    });
  }
});

// Get student's appointments
router.get('/my-appointments', auth, authorize('student'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = { student: req.user._id };

    if (status) {
      query.status = status;
    }

    const appointments = await Appointment.find(query)
      .populate('professor', 'name email department')
      .populate('availability')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Get student appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments'
    });
  }
});

// Get professor's appointments
router.get('/professor-appointments', auth, authorize('professor'), async (req, res) => {
  try {
    const { status, date } = req.query;
    let query = { professor: req.user._id };

    if (status) {
      query.status = status;
    }

    if (date) {
      query.date = new Date(date);
    }

    const appointments = await Appointment.find(query)
      .populate('student', 'name email')
      .populate('availability')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Get professor appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments'
    });
  }
});

// Cancel appointment (Professor only)
router.put('/cancel/:appointmentId', auth, authorize('professor'), async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      professor: req.user._id
    }).populate([
      { path: 'student', select: 'name email' },
      { path: 'availability' }
    ]);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Appointment is already cancelled'
      });
    }

    // Update appointment status
    appointment.status = 'cancelled';
    await appointment.save();

    // Free up the availability slot
    const availability = await Availability.findById(appointment.availability._id);
    if (availability) {
      availability.isBooked = false;
      availability.bookedBy = null;
      await availability.save();
    }

    res.json({
      success: true,
      message: 'Appointment cancelled successfully',
      data: appointment
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling appointment'
    });
  }
});

// Get appointment details
router.get('/:appointmentId', auth, async (req, res) => {
  try {
    const { appointmentId } = req.params;

    let query = { _id: appointmentId };

    // Students can only see their own appointments
    if (req.user.role === 'student') {
      query.student = req.user._id;
    }
    // Professors can only see appointments with them
    else if (req.user.role === 'professor') {
      query.professor = req.user._id;
    }

    const appointment = await Appointment.findOne(query)
      .populate('student', 'name email')
      .populate('professor', 'name email department')
      .populate('availability');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      data: appointment
    });
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointment'
    });
  }
});

// Update appointment status (for future use)
router.put('/:appointmentId/status', [
  auth,
  authorize('professor'),
  body('status').isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { appointmentId } = req.params;
    const { status } = req.body;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      professor: req.user._id
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    appointment.status = status;
    await appointment.save();

    // If cancelled, free up the slot
    if (status === 'cancelled') {
      const availability = await Availability.findById(appointment.availability);
      if (availability) {
        availability.isBooked = false;
        availability.bookedBy = null;
        await availability.save();
      }
    }

    await appointment.populate([
      { path: 'student', select: 'name email' },
      { path: 'professor', select: 'name email department' },
      { path: 'availability' }
    ]);

    res.json({
      success: true,
      message: 'Appointment status updated successfully',
      data: appointment
    });
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating appointment status'
    });
  }
});

module.exports = router;