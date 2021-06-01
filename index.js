var express = require("express");
var mysql = require("mysql");
const basicAuth = require("express-basic-auth");
require("dotenv").config();
var app = express();
var cors = require("cors");

app.use(express.json({ limit: "200mb" }));
app.use(cors({ origin: true, credentials: true }));
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "https://jakelawrence.github.io"); // update to match the domain you will make the request from
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(
  basicAuth({
    users: { APIUser: process.env.PASSWORD },
    unauthorizedResponse: getUnauthorizedResponse,
  })
);

function getUnauthorizedResponse(req) {
  return "Invalid Credentials";
}

function formatQueries(data) {
  var queries = [];
  var invoice_number = "";
  data.forEach((row) => {
    if (row.length) {
      var invoice = row.split("!@#");
      if (
        invoice[0] == "2.1" &&
        invoice[20] != "" &&
        !isNaN(parseFloat(invoice[52]))
      ) {
        if (!invoice_number.length) {
          invoice_number = invoice[5];
        }
        var statement = `INSERT INTO invoice_charges(invoice_number, tracking_number, transaction_date, charge_category_code, charge_category_detail_code, charge_description, package_dimensions, billing_weight, incentive_amount, net_amount)
        VALUES ('${invoice[5]}','${invoice[20]}', '${invoice[11]}', '${invoice[34]}', '${invoice[35]}', '${invoice[45]}', '${invoice[32]}', ${invoice[28]}, ${invoice[51]}, ${invoice[52]});`;
        queries.push(statement);
      }
    }
  });
  return { queries: queries, invoice_number: invoice_number };
}

const insertInvoiceCharges = async (query, connection) => {
  return new Promise((resolve) => {
    connection.query(query, function (error, results, fields) {
      if (error) {
        resolve(error);
        return;
      } else {
        resolve(results);
      }
    });
  });
};

const checkForInvoice = async (invoice_number, connection) => {
  return new Promise((resolve) => {
    connection.query(
      `select id from invoice_charges where invoice_number = '${invoice_number}' limit 1`,
      function (error, results, fields) {
        if (error) {
          resolve(error);
          return;
        } else {
          if (results.length) {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      }
    );
  });
};

app.post("/import", function (req, res) {
  (async () => {
    var connection = mysql.createConnection({
      host: "yaya-rds-1.cos90emopi6p.us-east-2.rds.amazonaws.com",
      port: "3306",
      user: "yaya_erp_utility",
      password: "yaya13155ERPUtilitiy",
      database: "yaya-erp",
      multipleStatements: true,
    });
    connection.connect(function (error) {
      if (error) {
        res
          .status(503)
          .send("Failed to connect to Database, please try again.");
        return;
      }
    });
    var data = req.body.csv.split("\n");
    var queries = formatQueries(data);
    var prevImported = false;

    if (req.body.checkPrevImported == 0 && queries.invoice_number.length) {
      prevImported = await checkForInvoice(queries.invoice_number, connection);
    }

    if (!prevImported && queries.invoice_number.length) {
      if (!req.body.lastImport) {
        var query = queries.queries.join("");
        await insertInvoiceCharges(query, connection);
        connection.end();
        res.send({ continue: false, message: "Successful Import of Invoices" });
      } else {
        var query = queries.queries.join("");
        await insertInvoiceCharges(query, connection);
        connection.end();
        res.send({ continue: true });
      }
    } else if (!queries.invoice_number.length) {
      connection.end();
      res.send({
        continue: false,
        message: "File is an invalid import",
      });
    } else {
      connection.end();
      res.send({
        continue: false,
        message: "Invoices have previously been imported",
      });
    }
  })();
});

app.listen(5000);
