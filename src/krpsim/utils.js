const fs = require("fs");
const { parseLines, getLines } = require("./parser");
const { Process } = require("./Process");

const getResources = (file) => {
  try {
    const parsedLines = getLines(file);
    const resources = parseLines(parsedLines);
    printParseResult(resources);
    return resources;
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

const validateParams = (params) => {
  if (params.length !== 2) {
    throw new Error("Two parameters are required.");
  }

  const [param1, param2] = params;
  if (!param1 || !param2) {
    throw new Error("Both parameters must be non-empty.");
  }

  if (!fs.existsSync(param1)) {
    throw new Error(`File at path ${param1} does not exist.`);
  }

  const file = fs.readFileSync(param1);
  return { file, delay: param2 };
};

const printParseResult = ({ stocks, processes, optimize }) => {
  console.log(
    `Nice file! ${Object.keys(processes).length} processes, ${
      Object.keys(stocks).length
    } stocks, ${[optimize].length} to optimize\n`
  );
};

/**
 * Updates the resource allocation.
 * @param {Object} stocksByTime - Resource map.
 * @param {number} currentTime - Time point.
 * @param {Object} stockUpdates - Resource changes (needs or outputs).
 * @param {boolean} [remove=false] - Whether to remove the resources.
 * @returns {Object} - Updated resource map.
 */
function updateStocksByTime(
  stocksByTime,
  currentTime,
  stockUpdates,
  remove = false
) {
  const sign = remove ? -1 : 1;

  if (!stocksByTime[currentTime]) {
    stocksByTime[currentTime] = {};
  }

  for (const [stock, amount] of Object.entries(stockUpdates)) {
    if (!stocksByTime[currentTime][stock]) {
      stocksByTime[currentTime][stock] = sign * amount;
    } else {
      stocksByTime[currentTime][stock] += sign * amount;
    }
  }

  return stocksByTime;
}

/**
 * Checks if resources are available.
 * @param {Object} stocksByTime - Resource map.
 * @param {number} currentTime - Time point.
 * @param {Object} requiredResources - Required resources.
 * @returns {boolean} - Whether all required resources are available.
 */
function hasEnoughResources(stocksByTime, currentTime, requiredResources) {
  if (!stocksByTime[currentTime]) {
    return false;
  }

  return Object.entries(requiredResources).every(
    ([stock, amount]) => stocksByTime[currentTime][stock] >= amount
  );
}

/**
 * Performs a check on the execution trace and resource allocation.
 * @param {Object.<string, number>} initialStocks - Initial resources.
 * @param {(string | Process)[][]} timeProcessMap - Execution trace (time, job pairs).
 * @returns {number} - The index of the failed job or -1 if all succeed.
 */
function check(initialStocks, timeProcessMap) {
  /** @type {Object.<number, Object.<string, number>>} */
  let stocksByTime = { [0]: { ...initialStocks } };
  let prevTimes = new Set([0]);
  let idx = 0;

  try {
    timeProcessMap.forEach(([currentTime, process]) => {
      console.log(`Evaluating: ${currentTime}:${process.name}`);

      const toRemove = [];
      for (const time of prevTimes) {
        if (time < currentTime) {
          toRemove.push(time);
          for (const [stock, amount] of Object.entries(stocksByTime[time])) {
            if (!stocksByTime[currentTime]) {
              stocksByTime[currentTime] = {};
            }
            stocksByTime[currentTime][stock] =
              (stocksByTime[currentTime][stock] || 0) + amount;
          }
        }
      }

      for (const time of toRemove) {
        prevTimes.delete(time);
        delete stocksByTime[time];
      }

      if (!hasEnoughResources(stocksByTime, currentTime, process.need)) {
        return idx;
      }

      stocksByTime = updateStocksByTime(
        stocksByTime,
        currentTime,
        process.need,
        true
      ); // Remove process needs
      stocksByTime = updateStocksByTime(
        stocksByTime,
        currentTime + process.time,
        process.output
      ); // Add process results
      prevTimes.add(currentTime + process.time);
      idx++;
    });
    return -1;
  } catch (error) {
    console.error("Error occurred during execution trace evaluation:", error);
    return idx;
  }
}

module.exports = { validateParams, printParseResult, getResources, check };
