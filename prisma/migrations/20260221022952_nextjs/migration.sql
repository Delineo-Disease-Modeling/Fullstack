-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "organization" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvenienceZone" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "cbg_list" TEXT[],
    "size" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "length" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "ConvenienceZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovementPattern" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "czone_id" INTEGER NOT NULL,

    CONSTRAINT "MovementPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaPData" (
    "id" TEXT NOT NULL,
    "czone_id" INTEGER NOT NULL,

    CONSTRAINT "PaPData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimData" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled Run',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patterns" TEXT NOT NULL,
    "simdata" TEXT NOT NULL,
    "czone_id" INTEGER NOT NULL,
    "length" INTEGER NOT NULL,

    CONSTRAINT "SimData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationStats" (
    "id" TEXT NOT NULL,
    "simDataId" INTEGER NOT NULL,
    "time" INTEGER NOT NULL,
    "location_id" TEXT NOT NULL,
    "location_type" TEXT NOT NULL,
    "population" INTEGER NOT NULL,
    "infected" INTEGER NOT NULL,
    "infected_list" BYTEA NOT NULL,

    CONSTRAINT "LocationStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POI" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "cbg" TEXT NOT NULL,
    "categories" TEXT[],

    CONSTRAINT "POI_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MovementPattern_czone_id_key" ON "MovementPattern"("czone_id");

-- CreateIndex
CREATE UNIQUE INDEX "PaPData_czone_id_key" ON "PaPData"("czone_id");

-- CreateIndex
CREATE UNIQUE INDEX "SimData_patterns_key" ON "SimData"("patterns");

-- CreateIndex
CREATE UNIQUE INDEX "SimData_simdata_key" ON "SimData"("simdata");

-- CreateIndex
CREATE INDEX "LocationStats_simDataId_location_id_time_idx" ON "LocationStats"("simDataId", "location_id", "time");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvenienceZone" ADD CONSTRAINT "ConvenienceZone_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementPattern" ADD CONSTRAINT "MovementPattern_czone_id_fkey" FOREIGN KEY ("czone_id") REFERENCES "ConvenienceZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaPData" ADD CONSTRAINT "PaPData_czone_id_fkey" FOREIGN KEY ("czone_id") REFERENCES "ConvenienceZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimData" ADD CONSTRAINT "SimData_czone_id_fkey" FOREIGN KEY ("czone_id") REFERENCES "ConvenienceZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationStats" ADD CONSTRAINT "LocationStats_simDataId_fkey" FOREIGN KEY ("simDataId") REFERENCES "SimData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
