import { describe, expect, it } from "vitest";
import {
  AWS_API_PROXY_PATH,
  isApnainternProductionHost,
  isDirectLambdaApiUrl,
  usesAwsApiProxy,
} from "@/lib/awsApiOrigin";

describe("awsApiOrigin", () => {
  it("detects Lambda execute-api URLs", () => {
    expect(
      isDirectLambdaApiUrl("https://eikmcrd7ei.execute-api.ap-south-1.amazonaws.com/staging")
    ).toBe(true);
    expect(isDirectLambdaApiUrl("https://apnaintern.in/aws-api")).toBe(false);
  });

  it("detects production hosts", () => {
    expect(isApnainternProductionHost("apnaintern.in")).toBe(true);
    expect(isApnainternProductionHost("www.apnaintern.in")).toBe(true);
    expect(isApnainternProductionHost("localhost")).toBe(false);
  });

  it("detects same-origin proxy paths", () => {
    expect(usesAwsApiProxy("https://apnaintern.in/aws-api/rest/v1/foo")).toBe(true);
    expect(usesAwsApiProxy(AWS_API_PROXY_PATH)).toBe(true);
  });
});
