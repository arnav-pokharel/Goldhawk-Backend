const pool = require("../../../db/pool");

// GET DASHBOARD OVERVIEW DATA
const getDashboardData = async (req, res) => {
    const { firm_uid } = req.query;


    if (!firm_uid) {
        return res.status(400).json({
            success: false,
            message: 'Firm UID is required'
        });
    }

    try {
        // Get firm basic info
        const firmResult = await pool.query(
            `SELECT id, uid, firm_name, firm_logo, firm_hq, found_year 
       FROM vc_firms WHERE uid::text = $1 OR id::text = $1`,
            [firm_uid]
        );

        const firm = firmResult.rows[0];

        if (!firm) {
            return res.status(404).json({
                success: false,
                message: 'Firm not found'
            });
        }

        // Use firm ID for queries
        const firmId = firm.id;

        // Get partners count
        const partnersResult = await pool.query(
            `SELECT COUNT(*) as total_partners,
              COUNT(CASE WHEN status = 'active' THEN 1 END) as active_partners
       FROM vc_partners WHERE firm_uid::text = $1`,
            [firmId]
        );


        // Get active deals count
        let activeDeals = 0;
        let portfolioCompanies = 0;

        try {
            const dealsResult = await pool.query(
                `SELECT COUNT(*) as active_deals 
         FROM deal WHERE investor_uid IN (
           SELECT partner_uid::text FROM vc_partners WHERE firm_uid::text = $1
         ) AND status = 'active'`,
                [firmId]
            );
            activeDeals = parseInt(dealsResult.rows[0].active_deals) || 0;
        } catch (dealsError) {
            activeDeals = 0;
        }

        // Get portfolio companies count
        try {
            const portfolioResult = await pool.query(
                `SELECT COUNT(DISTINCT startup_uid) as portfolio_companies 
         FROM deal WHERE investor_uid IN (
           SELECT partner_uid::text FROM vc_partners WHERE firm_uid::text = $1
         )`,
                [firmId]
            );
            portfolioCompanies = parseInt(portfolioResult.rows[0].portfolio_companies) || 0;
        } catch (portfolioError) {
            portfolioCompanies = 0;
        }

        const dashboardData = {
            firm: {
                id: firm.id,
                uid: firm.uid,
                name: firm.firm_name,
                logo: firm.firm_logo,
                location: firm.firm_hq,
                founded: firm.found_year
            },
            stats: {
                total_partners: parseInt(partnersResult.rows[0].total_partners) || 0,
                active_partners: parseInt(partnersResult.rows[0].active_partners) || 0,
                active_deals: activeDeals,
                portfolio_companies: portfolioCompanies
            }
        };


        res.status(200).json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('Get dashboard data error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
};

// GET FLOW DECK STARTUPS - Fixed missing columns
const getFlowDeckStartups = async (req, res) => {

    try {
        // Simple query without status and created_at columns since they don't exist
        const query = `
            SELECT 
                uid,
                company_name,
                hq_address,
                deal_amount,
                pitch1_description,
                thumb_url as pitch1_thumb,
                logo,
                stack_1,
                stack_2,
                stack_3,
                stack_4,
                metric_7,
                pitch_deck,
                views
            FROM startup_active 
            LIMIT 50
        `;


        const result = await pool.query(query);

        const startups = result.rows.map(startup => ({
            uid: startup.uid,
            company_name: startup.company_name || 'Unknown Company',
            hq_address: startup.hq_address || 'Location not specified',
            deal_amount: startup.deal_amount || 0,
            pitch1_description: startup.pitch1_description || 'No description available',
            pitch1_thumb: startup.pitch1_thumb || '',
            logo: startup.logo || '',
            stack_1: startup.stack_1 || '',
            stack_2: startup.stack_2 || '',
            stack_3: startup.stack_3 || '',
            stack_4: startup.stack_4 || '',
            metric_7: startup.metric_7 || '',
            pitch_deck: startup.pitch_deck || '',
            views: startup.views || 0
        }));


        res.status(200).json({
            success: true,
            startups: startups,
            total: startups.length
        });

    } catch (error) {
        console.error('Get flow deck startups error:', error);

        // Return empty array instead of error for development
        res.status(200).json({
            success: true,
            startups: [],
            total: 0,
            message: 'No startups data available'
        });
    }
};

module.exports = {
    getDashboardData,
    getFlowDeckStartups
};