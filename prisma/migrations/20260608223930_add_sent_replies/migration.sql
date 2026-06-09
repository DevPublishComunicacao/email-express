-- CreateTable
CREATE TABLE "sent_replies" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "autoReplyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_replies_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sent_replies" ADD CONSTRAINT "sent_replies_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_replies" ADD CONSTRAINT "sent_replies_autoReplyId_fkey" FOREIGN KEY ("autoReplyId") REFERENCES "auto_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
