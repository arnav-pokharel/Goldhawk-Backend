const express = require('express');

/**
 * Fetches legal documents and their status for a founder.
 * @param {express.Request} req The request object.
 * @param {express.Response} res The response object.
 */
exports.getLegals = async (req, res) => {
  const { uid } = req.query;

  if (!uid) {
    return res.status(400).json({ error: 'Founder UID is required.' });
  }

  try {
    // TODO: Replace this with your actual database logic to fetch legal documents for the user.
    const mockDocuments = [
      { name: 'Mutual NDA', status: 'signed' },
      { name: 'Founder Agreement', status: 'pending' },
      { name: 'Terms of Service', status: 'signed' },
    ];

    res.status(200).json({ documents: mockDocuments });
  } catch (error) {
    console.error('Error fetching legal documents:', error);
    res.status(500).json({ error: 'Failed to fetch legal documents.' });
  }
};