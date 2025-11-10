const pool = require("../../../db/pool");

const saveOnboardingData = async (req, res) => {
    const {
        uid,
        firm_name,
        firm_hq,
        found_year,
        legal_structure,
        url,
        firm_admin,
        admin_email,
        admin_phone,
        admin_title
    } = req.body;

    // Simple validation
    if (!uid || !firm_name || !firm_hq || !found_year || !legal_structure ||
        !firm_admin || !admin_email || !admin_phone || !admin_title) {
        return res.status(400).json({
            success: false,
            message: 'All required fields must be filled'
        });
    }

    try {
        // Update the firm with onboarding data
        const result = await pool.query(
            `UPDATE vc_firms 
       SET firm_name = $1, firm_hq = $2, found_year = $3, legal_structure = $4, 
           url = $5, firm_admin = $6, admin_email = $7, admin_phone = $8, 
           admin_title = $9, updated_at = NOW(), "updatedAt" = NOW()
       WHERE uid = $10
       RETURNING id, uid, email, firm_name, firm_number, firm_hq, found_year, 
                 legal_structure, url, firm_admin, admin_email, admin_phone, 
                 admin_title, is_verified`,
            [firm_name, firm_hq, found_year, legal_structure, url,
                firm_admin, admin_email, admin_phone, admin_title, uid]
        );

        const firm = result.rows[0];

        if (!firm) {
            return res.status(404).json({
                success: false,
                message: 'Firm not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Onboarding data saved successfully',
            firm: firm
        });

    } catch (error) {
        console.error('Save onboarding error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
module.exports = {
    saveOnboardingData
};