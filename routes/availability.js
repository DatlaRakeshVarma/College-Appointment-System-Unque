const express = require('express');
const { body, validationResult } = require('express-validator');
const Availability = require('../models/Availability');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Create availability slots (Professor only)
router.post('/', [
  auth,
  authorize('professor'),
  body('date').isISO8601().withMessage('Please provide a valid date in ISO format'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format')
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

    const { date, startTime, endTime } = req.body;

    // Check if slot already exists
    const existingSlot = await Availability.findOne({
      professor: req.user._id,
      date: new Date(date),
      startTime,
      endTime
    });

    if (existingSlot) {
      return res.status(400).json({
        success: false,
        message: 'This time slot already exists'
      });
    }

    const availability = new Availability({
      professor: req.user._id,
      date: new Date(date),
      startTime,
      endTime
    });

    await availability.save();
    await availability.populate('professor', 'name email department');

    res.status(201).json({
      success: true,
      message: 'Availability slot created successfully',
      data: availability
    });
  } catch (error) {
    console.error('Create availability error:', error);
    if (error.message.includes('End time must be after start time')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating availability slot'
    });
  }
});

// Get professor's availability slots
router.get('/my-slots', auth, authorize('professor'), async (req, res) => {
  try {
    const { date, status } = req.query;
    let query = { professor: req.user._id };

    if (date) {
      query.date = new Date(date);
    }

    if (status === 'available') {
      query.isBooked = false;
    } else if (status === 'booked') {
      query.isBooked = true;
    }

    const availability = await Availability.find(query)
      .populate('bookedBy', 'name email')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Get my slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching availability slots'
    });
  }
});

// Get available slots for a specific professor (Students can view)
router.get('/professor/:professorId', auth, async (req, res) => {
  try {
    const { professorId } = req.params;
    const { date } = req.query;

    // Verify professor exists
    const professor = await User.findById(professorId);
    if (!professor || professor.role !== 'professor') {
      return res.status(404).json({
        success: false,
        message: 'Professor not found'
      });
    }

    let query = { 
      professor: professorId, 
      isBooked: false,
      date: { $gte: new Date() } // Only future slots
    };

    if (date) {
      query.date = new Date(date);
    }

    const availability = await Availability.find(query)
      .populate('professor', 'name email department')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Get professor availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching professor availability'
    });
  }
});

// Get all professors (for students to see who they can book with)
router.get('/professors', auth, async (req, res) => {
  try {
    const professors = await User.find({ role: 'professor' })
      .select('name email department')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: professors
    });
  } catch (error) {
    console.error('Get professors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching professors'
    });
  }
});

// Delete availability slot (Professor only)
router.delete('/:slotId', auth, authorize('professor'), async (req, res) => {
  try {
    const { slotId } = req.params;

    const availability = await Availability.findOne({
      _id: slotId,
      professor: req.user._id
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability slot not found'
      });
    }

    if (availability.isBooked) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete booked slot. Cancel the appointment first.'
      });
    }

    await Availability.findByIdAndDelete(slotId);

    res.json({
      success: true,
      message: 'Availability slot deleted successfully'
    });
  } catch (error) {
    console.error('Delete availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting availability slot'
    });
  }
});

module.exports = router;