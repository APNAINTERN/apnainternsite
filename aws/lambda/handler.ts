/**
 * AWS Lambda entry — pay-per-request via API Gateway HTTP API.
 * Uses serverless-http to run the same Express app as local dev.
 */
import type { APIGatewayProxyEvent, Context } from "aws-lambda";
import serverless from "serverless-http";
import { createApp } from "../server/app";

type ServerlessHandler = ReturnType<typeof serverless>;

let handlerPromise: Promise<ServerlessHandler> | null = null;

async function getHandler(): Promise<ServerlessHandler> {
  if (!handlerPromise) {
    handlerPromise = createApp().then((app) =>
      serverless(app, {
        // API Gateway HTTP API sends base path at root
        basePath: "",
      })
    );
  }
  return handlerPromise;
}

export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
  // Allow SMTP / HTTP clients to finish without blocking Lambda freeze
  context.callbackWaitsForEmptyEventLoop = false;
  const fn = await getHandler();
  return fn(event, context);
};
