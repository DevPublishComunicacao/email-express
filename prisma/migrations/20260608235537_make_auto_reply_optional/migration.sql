-- DropForeignKey
ALTER TABLE "sent_replies" DROP CONSTRAINT "sent_replies_autoReplyId_fkey";

-- AlterTable
ALTER TABLE "sent_replies" ALTER COLUMN "autoReplyId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sent_replies" ADD CONSTRAINT "sent_replies_autoReplyId_fkey" FOREIGN KEY ("autoReplyId") REFERENCES "auto_replies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
