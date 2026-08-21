# MangabaClaw Amazon Bedrock Provider

Official MangabaClaw provider plugin for Amazon Bedrock. It adds Bedrock model discovery, text generation, embeddings, and guardrail-aware provider routing for agents that use AWS-hosted models.

Install from MangabaClaw:

```bash
mangabaclaw plugins install @mangabaclaw/amazon-bedrock-provider
```

Configure AWS credentials and region through your normal MangabaClaw credential/profile setup, then select Bedrock models with the `amazon-bedrock/...` provider prefix.
