const prisma = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const angel_saveOnboardingStep1 = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firm_name,
      entity_type,
      incorporation_add,
      found_date,
      aum,
      focus_stage,
      thesis
    } = req.body;

    // Check if user already has a VC firm
    let vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } }
    });

    // Create VC firm if it doesn't exist
    if (!vcFirm) {
      vcFirm = await prisma.vcFirm.create({
        data: {
          name: firm_name,
          users: {
            connect: { id: userId }
          }
        }
      });
    } else {
      // Update firm name if already exists
      await prisma.vcFirm.update({
        where: { id: vcFirm.id },
        data: { name: firm_name }
      });
    }

    // Save onboarding step 1 data
    const onboardingData = await prisma.vcOnboard1.upsert({
      where: { userId },
      update: {
        firmName: firm_name,
        entityType: entity_type,
        incorporationAdd: incorporation_add,
        foundDate: new Date(found_date),
        aum,
        focusStage: focus_stage,
        thesis
      },
      create: {
        firmName: firm_name,
        entityType: entity_type,
        incorporationAdd: incorporation_add,
        foundDate: new Date(found_date),
        aum,
        focusStage: focus_stage,
        thesis,
        userId,
        firmId: vcFirm.id
      }
    });

    res.status(200).json({
      success: true,
      message: 'Onboarding step 1 saved successfully',
      data: onboardingData
    });
  } catch (error) {
    console.error('Onboarding step 1 error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const angel_saveOnboardingStep2 = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      full_name,
      dob,
      nationality,
      residence,
      title,
      linkedin,
      email,
      phone
    } = req.body;

    // Get user's VC firm
    const vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } }
    });

    if (!vcFirm) {
      return res.status(404).json({
        success: false,
        message: 'VC firm not found. Please complete step 1 first.'
      });
    }

    // Save onboarding step 2 data
    const onboardingData = await prisma.vcOnboard2.upsert({
      where: { userId },
      update: {
        fullName: full_name,
        dob: new Date(dob),
        nationality,
        residence,
        title,
        linkedin,
        email,
        phone
      },
      create: {
        fullName: full_name,
        dob: new Date(dob),
        nationality,
        residence,
        title,
        linkedin,
        email,
        phone,
        userId,
        firmId: vcFirm.id
      }
    });

    res.status(200).json({
      success: true,
      message: 'Onboarding step 2 saved successfully',
      data: onboardingData
    });
  } catch (error) {
    console.error('Onboarding step 2 error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const angel_submitOnboarding = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if both onboarding steps are completed
    const step1 = await prisma.vcOnboard1.findUnique({
      where: { userId }
    });

    const step2 = await prisma.vcOnboard2.findUnique({
      where: { userId }
    });

    if (!step1 || !step2) {
      return res.status(400).json({
        success: false,
        message: 'Please complete both onboarding steps before submitting'
      });
    }

    // Get VC firm
    const vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } },
      include: {
        onboard1: true,
        onboard2: true
      }
    });

    res.status(200).json({
      success: true,
      message: 'Onboarding submitted successfully',
      data: vcFirm
    });
  } catch (error) {
    console.error('Onboarding submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  angel_saveOnboardingStep1,
  angel_saveOnboardingStep2,
  angel_submitOnboarding
};