import {z} from 'zod';
import {db} from '@/lib/db';
import {feedback} from '@/lib/db/schema';
import {readJson,rateLimit,RequestError,requestFailure} from '@/lib/requests';
export async function POST(req:Request){
 try{
  const parsed=z.object({kind:z.enum(['feedback','support']),email:z.union([z.email().max(254),z.literal('')]).optional(),message:z.string().trim().min(15).max(5000)}).safeParse(await readJson(req,22000));
  if(!parsed.success)throw new RequestError('Enter a message of 15–5,000 characters and a valid email if provided.');
  if(!db)throw new RequestError('Support is temporarily unavailable.',503);
  await rateLimit(req,'feedback',5,3600000);
  await db.insert(feedback).values({...parsed.data,email:parsed.data.email||null});
  return Response.json({received:true});
 }catch(e){return requestFailure(e);}
}
