/*
  Warnings:

  - You are about to drop the column `memberId` on the `channel_members` table. All the data in the column will be lost.
  - You are about to drop the column `workspaceId` on the `docFiles` table. All the data in the column will be lost.
  - You are about to drop the column `memberId` on the `message_reactions` table. All the data in the column will be lost.
  - You are about to drop the column `workflowId` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `workspaceId` on the `pages` table. All the data in the column will be lost.
  - You are about to drop the column `workspaceId` on the `shares` table. All the data in the column will be lost.
  - You are about to drop the column `memberId` on the `thread_replies` table. All the data in the column will be lost.
  - You are about to drop the `Channel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Conversation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DirectMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Member` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Message` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Server` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cursor_positions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whiteboard_activities` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whiteboard_collaborators` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whiteboard_comments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whiteboard_connections` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whiteboard_shapes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whiteboard_versions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whiteboards` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflow_runs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflow_step_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflow_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflows` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workspace_memberships` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workspaces` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[sourceMeetingId]` on the table `ai_meetings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[channelId,teamMemberId]` on the table `channel_members` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[messageId,teamMemberId,emoji]` on the table `message_reactions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `teamMemberId` to the `channel_members` table without a default value. This is not possible if the table is not empty.
  - Made the column `teamId` on table `pages` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `senderId` to the `thread_replies` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ChannelVisibility" AS ENUM ('TEAM', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "FileLinkType" AS ENUM ('CHANNEL', 'MESSAGE', 'PAGE', 'NOTE', 'TASK');

-- CreateEnum
CREATE TYPE "VMStatus" AS ENUM ('WAITING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "VMRole" AS ENUM ('HOST', 'CO_HOST', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "VMChatType" AS ENUM ('TEXT', 'REACTION', 'SYSTEM');

-- AlterEnum

-- AlterEnum

-- AlterEnum

-- DropForeignKey
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_serverId_fkey";

-- DropForeignKey
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_userId_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_memberOneId_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_memberTwoId_fkey";

-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT "DirectMessage_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT "DirectMessage_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_serverId_fkey";

-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_userId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_channelId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Server" DROP CONSTRAINT "Server_userId_fkey";

-- DropForeignKey
ALTER TABLE "channel_meetings" DROP CONSTRAINT "channel_meetings_channelId_fkey";

-- DropForeignKey
ALTER TABLE "channel_members" DROP CONSTRAINT "channel_members_channelId_fkey";

-- DropForeignKey
ALTER TABLE "channel_members" DROP CONSTRAINT "channel_members_memberId_fkey";

-- DropForeignKey
ALTER TABLE "cursor_positions" DROP CONSTRAINT "cursor_positions_userId_fkey";

-- DropForeignKey
ALTER TABLE "cursor_positions" DROP CONSTRAINT "cursor_positions_whiteboardId_fkey";

-- DropForeignKey
ALTER TABLE "message_bookmarks" DROP CONSTRAINT "message_bookmarks_messageId_fkey";

-- DropForeignKey
ALTER TABLE "message_reactions" DROP CONSTRAINT "message_reactions_memberId_fkey";

-- DropForeignKey
ALTER TABLE "message_reactions" DROP CONSTRAINT "message_reactions_messageId_fkey";

-- DropForeignKey
ALTER TABLE "message_threads" DROP CONSTRAINT "message_threads_messageId_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "pages" DROP CONSTRAINT "pages_teamId_fkey";

-- DropForeignKey
ALTER TABLE "pages" DROP CONSTRAINT "pages_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "shares" DROP CONSTRAINT "shares_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "thread_replies" DROP CONSTRAINT "thread_replies_memberId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_activities" DROP CONSTRAINT "whiteboard_activities_whiteboardId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_collaborators" DROP CONSTRAINT "whiteboard_collaborators_userId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_collaborators" DROP CONSTRAINT "whiteboard_collaborators_whiteboardId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_comments" DROP CONSTRAINT "whiteboard_comments_authorId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_comments" DROP CONSTRAINT "whiteboard_comments_whiteboardId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_connections" DROP CONSTRAINT "whiteboard_connections_whiteboardId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_shapes" DROP CONSTRAINT "whiteboard_shapes_whiteboardId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboard_versions" DROP CONSTRAINT "whiteboard_versions_whiteboardId_fkey";

-- DropForeignKey
ALTER TABLE "whiteboards" DROP CONSTRAINT "whiteboards_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "workflow_runs" DROP CONSTRAINT "workflow_runs_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "workflow_step_logs" DROP CONSTRAINT "workflow_step_logs_runId_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_createdById_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_teamId_fkey";

-- DropForeignKey
ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_userId_fkey";

-- DropForeignKey
ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_workspaceId_fkey";

-- DropIndex
DROP INDEX "channel_members_channelId_memberId_key";

-- DropIndex
DROP INDEX "channel_members_memberId_idx";

-- DropIndex
DROP INDEX "message_reactions_messageId_memberId_emoji_key";

-- DropIndex
DROP INDEX "pages_workspaceId_idx";

-- DropIndex
DROP INDEX "thread_replies_memberId_idx";

-- AlterTable
ALTER TABLE "Invitation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TeamDirectMessage" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLanguage" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "ai_meetings" ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "sourceMeetingId" TEXT;

-- AlterTable
ALTER TABLE "channel_members" DROP COLUMN "memberId",
ADD COLUMN     "teamMemberId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clip" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'both';

-- AlterTable
ALTER TABLE "docFiles" DROP COLUMN "workspaceId",
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "calendarAppType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "message_reactions" DROP COLUMN "memberId",
ADD COLUMN     "teamMemberId" TEXT;

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "workflowId";

-- AlterTable
ALTER TABLE "pages" DROP COLUMN "workspaceId",
ALTER COLUMN "visibility" SET DEFAULT 'TEAM',
ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "shares" DROP COLUMN "workspaceId";

-- AlterTable
ALTER TABLE "thread_replies" DROP COLUMN "memberId",
ADD COLUMN     "senderId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Channel";

-- DropTable
DROP TABLE "Conversation";

-- DropTable
DROP TABLE "DirectMessage";

-- DropTable
DROP TABLE "Member";

-- DropTable
DROP TABLE "Message";

-- DropTable
DROP TABLE "Server";

-- DropTable
DROP TABLE "cursor_positions";

-- DropTable
DROP TABLE "whiteboard_activities";

-- DropTable
DROP TABLE "whiteboard_collaborators";

-- DropTable
DROP TABLE "whiteboard_comments";

-- DropTable
DROP TABLE "whiteboard_connections";

-- DropTable
DROP TABLE "whiteboard_shapes";

-- DropTable
DROP TABLE "whiteboard_versions";

-- DropTable
DROP TABLE "whiteboards";

-- DropTable
DROP TABLE "workflow_runs";

-- DropTable
DROP TABLE "workflow_step_logs";

-- DropTable
DROP TABLE "workflow_templates";

-- DropTable
DROP TABLE "workflows";

-- DropTable
DROP TABLE "workspace_memberships";

-- DropTable
DROP TABLE "workspaces";

-- DropEnum
DROP TYPE "ShapeType";

-- CreateTable
CREATE TABLE "channel_invites" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ChannelType" NOT NULL DEFAULT 'TEXT',
    "coverImage" TEXT,
    "coverImageKey" TEXT,
    "visibility" "ChannelVisibility" NOT NULL DEFAULT 'TEAM',
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "senderId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "parentId" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamDirectMessageReaction" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamDirectMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamDirectMessageBookmark" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamDirectMessageBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTranscript" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalContent" TEXT NOT NULL,
    "summary" TEXT,
    "actionItems" JSONB,
    "keyPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_links" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "type" "FileLinkType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "linkedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_conferences" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Meeting',
    "description" TEXT,
    "hostId" TEXT NOT NULL,
    "password" TEXT,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "backgroundType" TEXT NOT NULL DEFAULT 'none',
    "backgroundValue" TEXT,
    "status" "VMStatus" NOT NULL DEFAULT 'WAITING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_conferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vm_participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "role" "VMRole" NOT NULL DEFAULT 'PARTICIPANT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "livekitIdentity" TEXT,

    CONSTRAINT "vm_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vm_chat_messages" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderImage" TEXT,
    "content" TEXT NOT NULL,
    "type" "VMChatType" NOT NULL DEFAULT 'TEXT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vm_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vm_waiting_entries" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'waiting',

    CONSTRAINT "vm_waiting_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "thumbnailUrl" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" TEXT,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_agent_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_agent_reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_agent_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_voice_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "wakeWord" TEXT NOT NULL DEFAULT 'hey conferio',
    "voiceId" TEXT NOT NULL DEFAULT '21m00Tcm4TlvDq8ikWAM',
    "proactiveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "language" TEXT NOT NULL DEFAULT 'en',
    "aiProvider" TEXT NOT NULL DEFAULT 'openai',
    "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_voice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_view_sessions" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "route_label" TEXT,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "duration" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_view_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_view_aggregates" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "route_label" TEXT,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "total_duration" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 1,
    "last_viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_view_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_invites_token_key" ON "channel_invites"("token");

-- CreateIndex
CREATE INDEX "channel_invites_token_idx" ON "channel_invites"("token");

-- CreateIndex
CREATE INDEX "channel_invites_channelId_idx" ON "channel_invites"("channelId");

-- CreateIndex
CREATE INDEX "channels_teamId_idx" ON "channels"("teamId");

-- CreateIndex
CREATE INDEX "channels_createdById_idx" ON "channels"("createdById");

-- CreateIndex
CREATE INDEX "messages_channelId_idx" ON "messages"("channelId");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_parentId_idx" ON "messages"("parentId");

-- CreateIndex
CREATE INDEX "TeamDirectMessageReaction_messageId_idx" ON "TeamDirectMessageReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamDirectMessageReaction_messageId_userId_emoji_key" ON "TeamDirectMessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "TeamDirectMessageBookmark_messageId_idx" ON "TeamDirectMessageBookmark"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamDirectMessageBookmark_messageId_userId_key" ON "TeamDirectMessageBookmark"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MeetingTranscript_meetingId_idx" ON "MeetingTranscript"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingTranscript_userId_idx" ON "MeetingTranscript"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingTranscript_meetingId_userId_language_key" ON "MeetingTranscript"("meetingId", "userId", "language");

-- CreateIndex
CREATE INDEX "file_links_fileId_idx" ON "file_links"("fileId");

-- CreateIndex
CREATE INDEX "file_links_type_contextId_idx" ON "file_links"("type", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "file_links_fileId_type_contextId_key" ON "file_links"("fileId", "type", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "video_conferences_roomId_key" ON "video_conferences"("roomId");

-- CreateIndex
CREATE INDEX "video_conferences_hostId_idx" ON "video_conferences"("hostId");

-- CreateIndex
CREATE INDEX "video_conferences_status_idx" ON "video_conferences"("status");

-- CreateIndex
CREATE INDEX "vm_participants_meetingId_idx" ON "vm_participants"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "vm_participants_meetingId_livekitIdentity_key" ON "vm_participants"("meetingId", "livekitIdentity");

-- CreateIndex
CREATE INDEX "vm_chat_messages_meetingId_createdAt_idx" ON "vm_chat_messages"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "vm_waiting_entries_meetingId_status_idx" ON "vm_waiting_entries"("meetingId", "status");

-- CreateIndex
CREATE INDEX "rooms_teamId_idx" ON "rooms"("teamId");

-- CreateIndex
CREATE INDEX "rooms_createdById_idx" ON "rooms"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_teamId_slug_key" ON "rooms"("teamId", "slug");

-- CreateIndex
CREATE INDEX "voice_agent_sessions_userId_idx" ON "voice_agent_sessions"("userId");

-- CreateIndex
CREATE INDEX "voice_agent_reminders_userId_scheduledAt_idx" ON "voice_agent_reminders"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "voice_agent_reminders_delivered_idx" ON "voice_agent_reminders"("delivered");

-- CreateIndex
CREATE UNIQUE INDEX "user_voice_settings_userId_key" ON "user_voice_settings"("userId");

-- CreateIndex
CREATE INDEX "route_view_sessions_route_idx" ON "route_view_sessions"("route");

-- CreateIndex
CREATE INDEX "route_view_sessions_user_id_idx" ON "route_view_sessions"("user_id");

-- CreateIndex
CREATE INDEX "route_view_sessions_team_id_idx" ON "route_view_sessions"("team_id");

-- CreateIndex
CREATE INDEX "route_view_sessions_started_at_idx" ON "route_view_sessions"("started_at");

-- CreateIndex
CREATE INDEX "route_view_aggregates_team_id_idx" ON "route_view_aggregates"("team_id");

-- CreateIndex
CREATE INDEX "route_view_aggregates_user_id_idx" ON "route_view_aggregates"("user_id");

-- CreateIndex
CREATE INDEX "route_view_aggregates_route_idx" ON "route_view_aggregates"("route");

-- CreateIndex
CREATE UNIQUE INDEX "route_view_aggregates_route_user_id_key" ON "route_view_aggregates"("route", "user_id");

-- CreateIndex
CREATE INDEX "TeamDirectMessage_parentId_idx" ON "TeamDirectMessage"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_meetings_sourceMeetingId_key" ON "ai_meetings"("sourceMeetingId");

-- CreateIndex
CREATE INDEX "channel_members_teamMemberId_idx" ON "channel_members"("teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channelId_teamMemberId_key" ON "channel_members"("channelId", "teamMemberId");

-- CreateIndex
CREATE INDEX "docFiles_teamId_idx" ON "docFiles"("teamId");

-- CreateIndex
CREATE INDEX "files_isDeleted_idx" ON "files"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_messageId_teamMemberId_emoji_key" ON "message_reactions"("messageId", "teamMemberId", "emoji");

-- CreateIndex
CREATE INDEX "shares_pageId_idx" ON "shares"("pageId");

-- CreateIndex
CREATE INDEX "thread_replies_senderId_idx" ON "thread_replies"("senderId");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_bookmarks" ADD CONSTRAINT "message_bookmarks_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_invites" ADD CONSTRAINT "channel_invites_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_invites" ADD CONSTRAINT "channel_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_meetings" ADD CONSTRAINT "channel_meetings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_replies" ADD CONSTRAINT "thread_replies_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDirectMessage" ADD CONSTRAINT "TeamDirectMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TeamDirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDirectMessageReaction" ADD CONSTRAINT "TeamDirectMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TeamDirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDirectMessageReaction" ADD CONSTRAINT "TeamDirectMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDirectMessageBookmark" ADD CONSTRAINT "TeamDirectMessageBookmark_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TeamDirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDirectMessageBookmark" ADD CONSTRAINT "TeamDirectMessageBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTranscript" ADD CONSTRAINT "MeetingTranscript_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "ai_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTranscript" ADD CONSTRAINT "MeetingTranscript_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docFiles" ADD CONSTRAINT "docFiles_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_conferences" ADD CONSTRAINT "video_conferences_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vm_participants" ADD CONSTRAINT "vm_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "video_conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vm_participants" ADD CONSTRAINT "vm_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vm_chat_messages" ADD CONSTRAINT "vm_chat_messages_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "video_conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vm_waiting_entries" ADD CONSTRAINT "vm_waiting_entries_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "video_conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vm_waiting_entries" ADD CONSTRAINT "vm_waiting_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_agent_sessions" ADD CONSTRAINT "voice_agent_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_agent_reminders" ADD CONSTRAINT "voice_agent_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_voice_settings" ADD CONSTRAINT "user_voice_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_view_sessions" ADD CONSTRAINT "route_view_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_view_sessions" ADD CONSTRAINT "route_view_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_view_aggregates" ADD CONSTRAINT "route_view_aggregates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_view_aggregates" ADD CONSTRAINT "route_view_aggregates_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
