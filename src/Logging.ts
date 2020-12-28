import winston from "winston";

winston.configure({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    winston.format.printf((info) => {
      let msg = info.message;
      msg = `${info.timestamp} ${info.level} [${info.type || ""}/${info.name || ""}]: ${msg}`;
      const exclude = ["timestamp", "level", "label", "message", "error", "type", "name"];
      Object.entries(info).forEach(([k, v]) => {
        if (exclude.includes(k)) {
          return;
        }
        msg += ` ${k}=${JSON.stringify(v)}`;
      });
      if (info.error) {
        msg += "\n";
        let error = info.error;
        while (error) {
          msg += error.message + "\n" + error.stack + "\n";
          error = error.nested;
        }
      }
      return msg;
    }),
  ),
  level: "silly",
  transports: [
    new winston.transports.Console(),
  ],
});

export default winston;
