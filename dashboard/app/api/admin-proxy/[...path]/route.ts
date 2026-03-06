import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: 'Admin API key not configured' },
      { status: 500 }
    );
  }

  const path = params.path.join('/');
  const backendUrl = `${BACKEND_URL}/api/v1/admin/${path}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${adminKey}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    try {
      const body = await req.text();
      if (body) {
        fetchOptions.body = body;
      }
    } catch {
      // No body — that's fine for some requests
    }
  }

  try {
    const response = await fetch(backendUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    const text = await response.text();
    return new NextResponse(text, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to connect to backend' },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}
