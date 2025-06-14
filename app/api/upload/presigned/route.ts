import { NextResponse } from "next/server";
import { s3Upload, validateAWSConfig } from "@/lib/aws-s3";

export async function POST(req: Request) {
  try {
    // Validate AWS configuration
    const awsConfig = validateAWSConfig();
    if (!awsConfig.isValid) {
      return NextResponse.json(
        { 
          error: "AWS configuration incomplete", 
          missing: awsConfig.missing,
          message: `Missing environment variables: ${awsConfig.missing.join(", ")}`
        },
        { status: 500 }
      );
    }

    const { fileName, fileType, fileSize } = await req.json();

    // Validate input
    if (!fileName || !fileType || !fileSize) {
      return NextResponse.json(
        { error: "Missing required fields: fileName, fileType, fileSize" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!fileType.startsWith('video/')) {
      return NextResponse.json(
        { error: "Only video files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (500MB limit)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (fileSize > maxSize) {
      return NextResponse.json(
        { error: "File size too large. Maximum 500MB allowed." },
        { status: 400 }
      );
    }

    // Generate presigned URL
    const presignedData = await s3Upload.getPresignedUploadUrl(
      fileName,
      fileType,
      fileSize
    );

    return NextResponse.json({
      success: true,
      uploadUrl: presignedData.uploadUrl,
      key: presignedData.key,
      fields: presignedData.fields,
    });

  } catch (error) {
    console.error("Failed to generate presigned URL:", error);
    return NextResponse.json(
      { 
        error: "Failed to generate upload URL",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 