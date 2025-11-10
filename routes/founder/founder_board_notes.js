const express = require("express");
const router = express.Router();
const founderBoardNotesController = require("../../controllers/founder/founder_board_notesController");

// Founder signs in dashboard
router.post("/:uid/founder-board-notes-sign", founderBoardNotesController.saveFounderBoardNotesSignature);

// Send sign request email to director
router.post("/:uid/send-board-notes-sign-request", founderBoardNotesController.sendBoardNotesSignRequest);

// Director signs via external link (notes-specific path to avoid conflicts)
router.post("/board-notes/sign/:token", founderBoardNotesController.saveDirectorBoardNotesSignature);

// Get external doc by token (notes-specific path)
router.get("/board-notes/sign/:token", founderBoardNotesController.getBoardNotesDocByToken);

// Lock/unlock the board consent notes (persisted)
router.post("/:uid/lock-board-notes", founderBoardNotesController.lockBoardNotes);

module.exports = router;
