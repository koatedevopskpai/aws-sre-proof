import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE = process.env.INCIDENTS_TABLE!;

// Tool: list incidents by severity. Input contract (the eventual MCP tool
// schema): { severity: "P1" | "P2" | ... }.
export async function handler(event: any) {
  const body = event?.body ? JSON.parse(event.body) : event;
  const severity = body?.severity ?? 'P1';

  const { Items } = await client.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'by-severity',
    KeyConditionExpression: 'severity = :s',
    ExpressionAttributeValues: { ':s': { S: severity } },
  }));

  return {
    severity,
    incidents: (Items ?? []).map((i) => ({
      id: i.id?.S,
      severity: i.severity?.S,
      createdAt: i.createdAt?.S,
    })),
  };
}
