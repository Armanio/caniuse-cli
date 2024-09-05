#!/usr/bin/env node

// TODO: parse markdown links in notes

const clc = require('cli-color');
const omelette = require('omelette');
const wrap = require('wordwrap')(80);
const caniuse = require('caniuse-db/fulldata-json/data-2.0.json');

const agents = ['chrome', 'edge', 'safari', 'firefox', 'ios_saf', 'and_chr'];
const defaultItemWidth = 12;

// @TODO: reinstate these …
const columnWidths = {};

/**
 * getCurrentAgentVersion() returns the current agent version
 */
const getCurrentAgentVersion = function getCurrentAgentVersion(agent) {
  try {
    return caniuse.agents[agent].current_version;
  } catch (error) {
    return undefined;
  }
};

/**
 * strRepeat() returns string str repeater qty times
 */
const strRepeat = function strRepeat(str, qty) {
  let result = '';
  for (let i = 0; i < qty; i += 1) {
    result += str;
  }
  return result;
};

/**
 * padCenter() returns fixed length string,
 * padding with padStr from both sides if necessary
 */
const padCenter = function padCenter(str, length = defaultItemWidth, padStr) {
  const padLen = length - str.length;

  return strRepeat(padStr, Math.ceil(padLen / 2))
    + str
    + strRepeat(padStr, Math.floor(padLen / 2));
};

/**
 * printTableHeader() prints `caniuse` table header
 */
const printTableHeader = function printTableHeader() {
  agents.forEach((agent) => {
    const col = clc.black.bgWhite(padCenter(caniuse.agents[agent].browser, columnWidths[agent], ' '));
    process.stdout.write(col);
    process.stdout.write(' ');
  });

  process.stdout.write('\n');
};

/**
 * printTableRowItem prints `caniuse` table row column
 */
const printTableRowItem = function printTableRowItem(agent, versionString, stat) {
  let toPrint = versionString;
  
  // Support is indicated by the first character of
  const supportCodes = stat.split(' ');
  const isSupported = supportCodes[0];
  
  const notes = supportCodes.filter(s => s.startsWith('#'));
  if (notes.length) {
    toPrint += ` [${notes.map(s => s.substr(1)).join(',')}]`;
  }

  const text = padCenter(toPrint, columnWidths[agent], ' ');

  switch (isSupported) {
    case 'y': // (Y)es, supported by default
      process.stdout.write(clc.white.bgGreen(text));
      return;
    case 'a': // (A)lmost supported (aka Partial support)
      process.stdout.write(clc.white.bgYellow(text));
      return;
    case 'u': // Support (u)nknown
      process.stdout.write(clc.white.bgXterm(240)(text));
      return;
    case 'p': // No support, but has (P)olyfill
    case 'n': // (N)o support, or disabled by default
    case 'x': // Requires prefi(x) to work
    case 'd': // (D)isabled by default (need to enable flag or something)
    default:
      process.stdout.write(clc.white.bgRed(text));
  }
};

/**
 *  printTableRow prints `caniuse` trable row
 */
const printTableRow = function printTableRow(stats, index) {
  agents.forEach((agent, i) => {
    let dataItem = stats[agent][index];

    if (dataItem !== null) {
      printTableRowItem(agent, dataItem.versionString, dataItem.stat);
    } else {
      // Fill up cell with whitespace
      process.stdout.write(padCenter('', columnWidths[agent], ' '));
    }

    // Space between the cells
    if (i < agents.length - 1) {
      if (dataItem && dataItem.currentVersion) {
        process.stdout.write(clc.bgBlackBright(' '));
      } else {
        process.stdout.write(' ');
      }
    }
  });

  process.stdout.write('\n');
};

const flattenStats = function flattenStats(stats) {

  const newStats = {};
  const agentPositions = {};

  agents.forEach(agent => {
    // Get original stats
    // @TODO: handle “all”
    const agentStats = stats[agent];

    // Get current agent version
    const currentVersion = getCurrentAgentVersion(agent);

    // Keep track of how many stats we added before the current version,
    // after the current version, and where the current version is in the reworked
    // set. We use these numbers to align the tables so that there is one row with
    // all the current versions
    let numBeforeCurrent = 0;
    let numAfterCurrent = 0;
    let indexOfCurrent = null;

    // Create groups of support
    // [
    //  { stat: 'n', versions: [1,2,3] },
    //  { stat: 'n #1', versions: [4,5,6] },
    //  { stat: 'a #2', versions: [7] },
    //  { stat: 'y', versions: [8,9,10,11,12] },
    //  { stat: 'y', versions: [13] }, <-- Current Version
    //  { stat: 'y', versions: [14,15,TP] }
    // ]
    const groupedStats = [];
    let prevStat = null;
    // @TODO: These don’t retain order … so you’re basically screwed
    for (version_list_entry of caniuse.agents[agent].version_list) {
      const version = version_list_entry.version;
      const stat = agentStats[version];

      const isCurrentVersion = version == currentVersion;
      if (stat != prevStat || isCurrentVersion) {
        groupedStats.push({
          stat,
          versions: [version],
          currentVersion: isCurrentVersion,
        });

        if (isCurrentVersion) {
          indexOfCurrent = groupedStats.length - 1;
        } else { 
          if (indexOfCurrent === null) {
            numBeforeCurrent++;
          } else {
            numAfterCurrent++;
          }
        }
      } else {
        groupedStats[groupedStats.length-1].versions.push(version);
      }

      // Store prevStat. Set it to null when isCurrentVersion
      // to make sure the currentVersion has its own entry
      prevStat = isCurrentVersion ? null : stat;
    }

    // Flatten the versions
    // E.g.  [1,2,3] --> '1-3'
    for (let entry of groupedStats) {
      const { versions } = entry;
      let versionString = '';
      if (versions.length == 1) {
        versionString = versions[0];
      } else {
        const firstVersion = versions[0].split('-')[0];
        const lastVersion = versions[versions.length-1].includes('-') ? versions[versions.length-1].split('-')[1] : versions[versions.length-1];
        versionString = `${firstVersion}-${lastVersion}`;
      }
      entry.versionString = versionString;
    }

    newStats[agent] = groupedStats;
    agentPositions[agent] = {
      numBeforeCurrent,
      indexOfCurrent,
      numAfterCurrent,
    };
  });

  // Pad the data per agent, so that each agent has the same amount of entries before and after the current
  // (thereby making the indexOfCurrent the same for all agents)
  const maxNumBeforeCurrent = Math.max(...Object.values(agentPositions).map(agentPositionInfo => agentPositionInfo.numBeforeCurrent));
  const maxNumAfterCurrent = Math.max(...Object.values(agentPositions).map(agentPositionInfo => agentPositionInfo.numAfterCurrent));

  agents.forEach(agent => {
    if (agentPositions[agent].numBeforeCurrent < maxNumBeforeCurrent) {
      for (let i = 0; i < maxNumBeforeCurrent - agentPositions[agent].numBeforeCurrent; i++) {
        newStats[agent].unshift(null);
      }
    }
    if (agentPositions[agent].numAfterCurrent < maxNumAfterCurrent) {
      for (let i = 0; i < maxNumAfterCurrent - agentPositions[agent].numAfterCurrent; i++) {
        newStats[agent].push(null);
      }
    }
  });

  return {
    data: newStats,
    numRows: maxNumBeforeCurrent + maxNumAfterCurrent,
  };
}


/**
 * printItem() prints `caniuse` results for specified item
 */
const printItem = function printItem(item) {
  item.stats = flattenStats(item.stats);
  console.log(clc.bold(wrap(`${item.title}`)));
  console.log(clc.underline(`https://caniuse.com/#feat=${item.key}`));
  console.log();
  console.log(wrap(item.description));
  console.log();
  printTableHeader();
  for (let i = 0; i <= item.stats.numRows; i++) {
    printTableRow(item.stats.data, i);
  }
  if (item.notes) {
    console.log();
    console.log(wrap(`Notes: ${item.notes}`));
  }
  // @TODO: Only print the notes that were printed in tablerows
  if (item.notes_by_num) {
    console.log();
    console.log(`Notes by number:`);
    console.log();
    Object.entries(item.notes_by_num).forEach(([num, note]) => {
      console.log(wrap(`[${num}] ${note}`));
    });
    console.log();
  }
};

/**
 * parseKeywords() parses keywords from string
 * returns parsed array of keywords
 */
const parseKeywords = function parseKeywords(keywords) {
  const parsedKeywords = [];

  keywords.split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .forEach(item => {
      parsedKeywords.push(item);
      if (item.includes(' ')) parsedKeywords.push(item.replaceAll(' ', '-'))
    });

  return parsedKeywords;
};

/**
 * findResult() returns `caniuse` item matching given name
 */
const findResult = function findResult(name) {
  const items = caniuse.data;

  // return directly matching item
  if (items[name] !== undefined) {
    return items[name];
  }

  // find items matching by keyword or firefox_id
  const otherResults = Object.keys(caniuse.data).filter((key) => {
    const keywords = parseKeywords(caniuse.data[key].keywords);

    return caniuse.data[key].firefox_id === name ||
      keywords.indexOf(name) >= 0 ||
      keywords.join(',').includes(name);
  });

  // return array of matches
  if (otherResults.length > 0) {
    return otherResults.reduce((list, key) => list.concat(caniuse.data[key]), []);
  }

  return undefined;
};

/**
 * omelette tab completion results for first argument
 */
const firstArgument = ({ reply }) => {
  // add all keys
  const dataKeys = Object.keys(caniuse.data);

  // add keywords and firefox_id's
  const otherKeys = Object.keys(caniuse.data).reduce((keys, item) => {
    let newKeys = [];
    const { firefox_id, keywords } = caniuse.data[item];

    if (firefox_id.length > 0) {
      newKeys.push(firefox_id);
    }

    newKeys = newKeys.concat(parseKeywords(keywords));

    return [].concat(keys, newKeys);
  });

  reply([].concat(dataKeys, otherKeys));
};

// initialize omelette tab completion
omelette`caniuse ${firstArgument}`.init();

// inject key for each item in data object
Object.keys(caniuse.data).forEach((key) => {
  caniuse.data[key].key = key;
});

// find and display result
const name = process.argv[2]?.toLowerCase();
const res = findResult(name);

if (res !== undefined) {
  if (Array.isArray(res)) {
    res.forEach(item => printItem(item));
  } else {
    printItem(res);
  }
} else {
  console.log('Nothing was found');
}
