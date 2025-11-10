const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/database');
const { sendPartnerInviteEmail } = require('../utils/email');

const angel_getPartners = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's VC firm
    const vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } },
      include: {
        partners: {
          include: {
            partnerUser: true
          }
        }
      }
    });

    if (!vcFirm) {
      return res.status(404).json({
        success: false,
        message: 'VC firm not found'
      });
    }

    // Separate pending and active partners
    const pendingPartners = vcFirm.partners.filter(partner => partner.status === 'pending');
    const activePartners = vcFirm.partners.filter(partner => partner.status === 'active');

    res.status(200).json({
      success: true,
      data: {
        pending: pendingPartners,
        active: activePartners
      }
    });
  } catch (error) {
    console.error('Get partners error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const angel_addPartner = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, role, email, phone } = req.body;

    // Get user's VC firm
    const vcFirm = await prisma.vcFirm.findFirst({
      where: { users: { some: { id: userId } } }
    });

    if (!vcFirm) {
      return res.status(404).json({
        success: false,
        message: 'VC firm not found'
      });
    }

    // Check if partner already exists with this email
    const existingPartner = await prisma.vcPartner.findFirst({
      where: {
        firmUid: vcFirm.id,
        email
      }
    });

    if (existingPartner) {
      return res.status(400).json({
        success: false,
        message: 'Partner with this email already exists'
      });
    }

    // Create partner record
    const partner = await prisma.vcPartner.create({
      data: {
        firmUid: vcFirm.id,
        role,
        email,
        fullName: full_name,
        phone,
        status: 'pending'
      }
    });

    // Send invitation email
    await sendPartnerInviteEmail(email, vcFirm.name, userId);

    res.status(201).json({
      success: true,
      message: 'Partner invitation sent successfully',
      data: partner
    });
  } catch (error) {
    console.error('Add partner error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const angel_acceptPartnerInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Verify token (in a real app, you'd use JWT or similar)
    // For simplicity, we'll use the user ID from token
    const invitingUserId = token; // This should be decoded from a proper token

    // Get inviting user's VC firm
    const invitingUser = await prisma.angelUser.findUnique({
      where: { id: invitingUserId },
      include: { vcFirm: true }
    });

    if (!invitingUser || !invitingUser.vcFirm) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invitation link'
      });
    }

    // Find pending partner record by email
    const partner = await prisma.vcPartner.findFirst({
      where: {
        firmUid: invitingUser.vcFirm.id,
        email: req.user.email,
        status: 'pending'
      }
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'No pending invitation found for your email'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update partner record
    const updatedPartner = await prisma.vcPartner.update({
      where: { id: partner.id },
      data: {
        partnerUid: req.user.id,
        password: hashedPassword,
        status: 'active'
      }
    });

    // Add to role-specific table
    if (partner.role === 'General Partner') {
      await prisma.vcGp.create({
        data: {
          uid: invitingUser.vcFirm.id,
          gpUid: partner.id
        }
      });
    } else if (partner.role === 'Associate') {
      await prisma.vcAssociate.create({
        data: {
          uid: invitingUser.vcFirm.id,
          associateUid: partner.id
        }
      });
    } else if (partner.role === 'Administrative') {
      await prisma.vcAdministrative.create({
        data: {
          uid: invitingUser.vcFirm.id,
          adminUid: partner.id
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Partner invitation accepted successfully',
      data: updatedPartner
    });
  } catch (error) {
    console.error('Accept partner invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  angel_getPartners,
  angel_addPartner,
  angel_acceptPartnerInvite
};