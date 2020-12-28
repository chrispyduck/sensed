import http from "http";
import url from "url";
import client from "prom-client";
import IConfiguration from "./IConfiguration";

export default class Metrics {
  private readonly register = new client.Registry();
  private server: http.Server | undefined;

  public init = (config: IConfiguration): void => {
    this.register.setDefaultLabels({ 
      device: config.device.name
    });
    client.collectDefaultMetrics({
      register: this.register
    });

    this.server = http.createServer(this.handleRequest);
    this.server.listen(80);
  } 

  public shutdown = async (): Promise<void> => {
    return new Promise((resolve, reject) => this.server?.close(e => {
      if (e)
        reject(e);
      else
        resolve();
    }));
  }

  private handleRequest: http.RequestListener = async (request, response) => {
    if (!request.url)
      return;
    const route = url.parse(request.url).pathname;
    if (route === "/metrics") {
      response.setHeader("Content-Type", this.register.contentType);
      response.end(this.register.metrics());
    } else if (route === "/health") {
      response.end("OK");
    }
  }
}