/* What a project *is*, shared: the five resource files and the defaults a
 * brand-new (or partially-populated) data directory gets. Required by both
 * server.js and the `./board new` scaffold, so the two can never drift on
 * what a fresh board looks like.
 */
// resource name (used in /api/<resource>) → data file.
const FILES = {
  epics: "epics.json",
  stories: "stories.json",
  ideas: "ideas.json",
  config: "config.json",
  milestones: "milestones.json",
};

// Resources whose whole value is an object rather than an array.
const OBJECT_RESOURCES = new Set(["config", "milestones"]);

// Sensible defaults when a project's data dir doesn't have a file yet —
// so a brand-new project can point BOARD_DATA_DIR at an empty directory
// and get a working (empty) board instead of an error.
const DEFAULTS = {
  epics: [],
  stories: [],
  ideas: [],
  config: {
    lanes: ["Backlog", "In Progress", "Review", "Done"],
    priorities: ["Now", "Next", "Later", "Someday"],
    themes: [],
    milestones: [],
    open_gates: [],
    wip_limits: {},
    view: { title: "Board", default_page: "board", default_milestone: "all", default_theme: "all" },
  },
  milestones: { overview: null, milestones: [] },
};


module.exports = { FILES, OBJECT_RESOURCES, DEFAULTS };
