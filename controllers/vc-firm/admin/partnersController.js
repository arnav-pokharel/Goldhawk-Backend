const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require("../../../db/pool");
const { sendPartnerInvitationEmail } = require('../../../utils/emailService');

// Generate invitation token
const generateInvitationToken = (partnerId, email, firmUid, expiresIn = '7d') => {
    return jwt.sign(
        { partnerId, email, firmUid, role: 'partner_invitation' },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

// Generate a safe account number within integer range
const generateAccountNumber = () => {
    return Math.floor(100000000 + Math.random() * 900000000); // 9-digit number
};

// INVITE NEW PARTNER (Admin only)
const invitePartner = async (req, res) => {
    const {
        firm_uid,
        full_name,
        email,
        phone,
        role,
        admin_uid
    } = req.body;

    if (!firm_uid || !full_name || !email || !role || !admin_uid) {
        return res.status(400).json({
            success: false,
            message: 'Firm UID, full name, email, role, and admin UID are required'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');


        // Search by both id and uid fields with explicit casting to text
        const firmCheck = await client.query(
            "SELECT id, uid, firm_name FROM vc_firms WHERE id::text = $1 OR uid::text = $1",
            [firm_uid]
        );

        console.log('Firm check result:', firmCheck.rows);

        if (firmCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Firm not found. Please check the firm UID.'
            });
        }

        const firm = firmCheck.rows[0];

        // Use the firm's ID for the vc_partners relationship
        const firmId = firm.id;


        // Check if partner already exists with this email in the same firm
        const existingResult = await client.query(
            "SELECT 1 FROM vc_partners WHERE email = $1 AND firm_uid::text = $2",
            [email, firmId]
        );

        if (existingResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                message: 'A partner with this email already exists in your firm'
            });
        }


        // Generate IDs
        const partnerId = uuidv4();
        const partnerUid = uuidv4();
        const angelUserId = uuidv4();

        // Check if angel_users record already exists for this email
        const existingAngelUser = await client.query(
            "SELECT id FROM angel_users WHERE email = $1",
            [email]
        );

        let finalAngelUserId = angelUserId;

        if (existingAngelUser.rows.length > 0) {
            // Use existing angel_users record
            finalAngelUserId = existingAngelUser.rows[0].id;
        } else {
            // Create new angel_users record
            const tempPassword = await bcrypt.hash(uuidv4(), 12); // Temporary password

            await client.query(
                `INSERT INTO angel_users (
          id, email, password, "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, NOW(), NOW()
        )`,
                [finalAngelUserId, email, tempPassword]
            );
        }


        // Create partner record with pending status
        const partnerResult = await client.query(
            `INSERT INTO vc_partners (
        id, firm_uid, partner_uid, "angelUserId", full_name, email, phone, role, status,
        "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      ) RETURNING id, partner_uid, full_name, email, role, status`,
            [partnerId, firmId, finalAngelUserId, finalAngelUserId, full_name, email, phone, role, 'pending']
        );

        const partner = partnerResult.rows[0];

        // Step 5: If role is general partner, also add to vc_gp table
        if (role.toLowerCase().includes('general partner') || role.toLowerCase().includes('general_partner')) {
            const gpId = uuidv4();
            const accNo = generateAccountNumber(); // Use safe account number generator


            await client.query(
                `INSERT INTO vc_gp (
          id, uid, gp_uid, gp_name, email, acc_no, profile_pic,
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        )`,
                [gpId, firmId, partnerId, full_name, email, accNo, null]
            );

        }

        await client.query('COMMIT');

        // Step 6: Generate invitation token and send email
        const invitationToken = generateInvitationToken(partnerId, email, firm.uid);

        // Create invitation URL
        const invitationUrl = `${process.env.FRONTEND_URL || 'http://localhost:9002'}/investor/vc_firm/general_partner/set-password?token=${invitationToken}`;

        console.log('Invitation URL:', invitationUrl);

        // Send invitation email
        try {
            await sendPartnerInvitationEmail(email, full_name, invitationUrl, role);
        } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
            // Continue even if email fails
        }

        res.status(201).json({
            success: true,
            message: 'Partner invited successfully. Invitation email sent.',
            partner: {
                id: partner.id,
                uid: partner.partner_uid,
                name: partner.full_name,
                email: partner.email,
                role: partner.role,
                status: partner.status
            },
            invitation_url: invitationUrl,
            firm: {
                id: firm.id,
                uid: firm.uid,
                name: firm.firm_name
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');

        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'A partner with this email already exists.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    } finally {
        client.release();
    }
};

// GET ALL PARTNERS FOR A FIRM (Admin only)
const getPartners = async (req, res) => {
    const { firm_uid } = req.query;

    if (!firm_uid) {
        return res.status(400).json({
            success: false,
            message: 'Firm UID is required'
        });
    }

    try {

        // Search by both id and uid fields with explicit casting
        const firmCheck = await pool.query(
            "SELECT id, uid, firm_name FROM vc_firms WHERE id::text = $1 OR uid::text = $1",
            [firm_uid]
        );

        console.log('Firm check result:', firmCheck.rows);

        if (firmCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Firm not found. Please check the firm UID.'
            });
        }

        const firm = firmCheck.rows[0];

        // Use the firm's ID for the vc_partners relationship
        const firmId = firm.id;

        const result = await pool.query(
            `SELECT 
    p.id,
    p.partner_uid,
    p.full_name as name,
    p.email,
    p.role,
    p.phone,
    p.status,
    p."createdAt" as created_at,
    f.firm_name
   FROM vc_partners p
   LEFT JOIN vc_firms f ON p.firm_uid = f.id
   WHERE p.firm_uid = $1
   ORDER BY p."createdAt" DESC`,
            [firmId]
        );

        const partners = result.rows.map(partner => ({
            id: partner.id,
            uid: partner.partner_uid,
            name: partner.name,
            email: partner.email,
            role: partner.role,
            phone: partner.phone,
            status: partner.status,
            avatar: null,
            firm_name: partner.firm_name,
            created_at: partner.created_at
        }));


        res.status(200).json({
            success: true,
            partners: partners,
            firm: {
                id: firm.id,
                uid: firm.uid,
                name: firm.firm_name
            }
        });

    } catch (error) {
        console.log('Get partners error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// GET SPECIFIC PARTNER (Admin only)
const getPartnerById = async (req, res) => {
    const { partnerId } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
        p.*,
        f.firm_name,
        f.firm_logo
       FROM vc_partners p
       LEFT JOIN vc_firms f ON p.firm_uid = f.id
       WHERE p.id::text = $1 OR p.partner_uid::text = $1`,
            [partnerId]
        );

        const partner = result.rows[0];

        if (!partner) {
            return res.status(404).json({
                success: false,
                message: 'Partner not found'
            });
        }

        res.status(200).json({
            success: true,
            partner: partner
        });

    } catch (error) {
        console.log('Get partner error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// UPDATE PARTNER (Admin only)
const updatePartner = async (req, res) => {
    const { partnerId } = req.params;
    const { full_name, phone, role } = req.body;

    try {
        const result = await pool.query(
            `UPDATE vc_partners 
       SET full_name = $1, phone = $2, role = $3, "updatedAt" = NOW()
       WHERE id::text = $4 OR partner_uid::text = $4
       RETURNING *`,
            [full_name, phone, role, partnerId]
        );

        const partner = result.rows[0];

        if (!partner) {
            return res.status(404).json({
                success: false,
                message: 'Partner not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Partner updated successfully',
            partner: partner
        });

    } catch (error) {
        console.log('Update partner error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// DELETE PARTNER (Admin only)
const deletePartner = async (req, res) => {
    const { partnerId } = req.params;

    try {
        const result = await pool.query(
            `DELETE FROM vc_partners 
       WHERE id::text = $1 OR partner_uid::text = $1
       RETURNING id`,
            [partnerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Partner not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Partner deleted successfully'
        });

    } catch (error) {
        console.log('Delete partner error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    getPartners,
    invitePartner,
    getPartnerById,
    updatePartner,
    deletePartner
};