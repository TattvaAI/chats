import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({error:'Verify your email with a sign-in code first.'},{status:410});
}
