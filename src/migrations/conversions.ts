// BUSINESS CATEGORIES
import {
  BusinessCategoriesCreateSchema,
  type BusinessCategoriesCreate,
} from "@/schemas";
import BusinessCategoriesData from "../importData/BusinessCategories.json";

// CONTACTS
import {
  ContactsCreateSchema,
  type ContactsCreate as ZContacts,
} from "@/schemas";
import Contacts from "../importData/Contacts.json";

// CONTACTS COUNCILS
import {
  ContactsCouncilsCreateSchema,
  type ContactsCouncilsCreate,
} from "@/schemas";
import ContactsCouncils from "../importData/ContactsCouncils.json";

// COUNCILS
import {
  CouncilsCreateSchema,
  type CouncilsCreate as ZCouncils,
} from "@/schemas";
import Councils from "../importData/Councils.json";

// DOCUMENTS
import {
  DocumentsCreateSchema,
  type DocumentsCreate as ZDocuments,
} from "@/schemas";
import Documents from "../importData/Documents.json";

// Events
import { EventsCreateSchema, type EventsCreate as ZEvents } from "@/schemas";
import Events from "../importData/Events.json";

// LinkCategories
import {
  LinkCategoriesCreateSchema,
  type LinkCategoriesCreate,
} from "@/schemas";
import LinkCategoriesData from "../importData/LinkCategories.json";

// Links
import { LinksCreateSchema, type LinksCreate } from "@/schemas";
import LinksData from "../importData/Links.json";

// Regions
import { RegionsCreateSchema, type RegionsCreate } from "@/schemas";
import RegionsData from "../importData/Regions.json";

// Testimonials
import { TestimonialsCreateSchema, type TestimonialsCreate } from "@/schemas";
import TestimonialsData from "../importData/Testimonials.json";

// New collections added below
// Announcements
import { AnnouncementsCreateSchema, type AnnouncementsCreate } from "@/schemas";
import { AnnouncementsCommentsCreateSchema, type AnnouncementsCommentsCreate } from "@/schemas";

// Member Requests 
import { MemberRequestsCreateSchema, type MemberRequestsCreate } from "@/schemas";
import { MemberRequestsCommentsCreateSchema, type MemberRequestsCommentsCreate } from "@/schemas";

// Articles 
import { ArticlesCreateSchema, type ArticlesCreate } from "@/schemas";
import { ArticlesCommentsCreateSchema, type ArticlesCommentsCreate } from "@/schemas";

// Knowledge Base 
import { KnowledgeBaseCreateSchema, type KnowledgeBaseCreate } from "@/schemas";
import { KnowledgeBaseCommentsCreateSchema, type KnowledgeBaseCommentsCreate } from "@/schemas";

function safeParseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

export const convertBusinessCategories = async (): Promise<
  BusinessCategoriesCreate[]
> => {
  console.log("Beginning to convert BusinessCategories.json");
  const newBusinessCategories: BusinessCategoriesCreate[] = [];
  if (BusinessCategoriesData && BusinessCategoriesData.RECORDS) {
    for (const category of BusinessCategoriesData.RECORDS) {
      const newCategory: BusinessCategoriesCreate =
        BusinessCategoriesCreateSchema.parse({
          bizCatName: category.biz_cat_name,
          bizCatIdOrg: category.biz_cat_id.toString(),
        });
      newBusinessCategories.push(newCategory);
    }
  }
  console.log(
    `Finished converting BusinessCategories.json, created ${newBusinessCategories.length} new business categories`
  );
  return newBusinessCategories;
};

export const convertContacts = async (): Promise<ZContacts[]> => {
  console.log("Beginning to convert Contacts.json");
  const newContacts: ZContacts[] = [];
  if (Contacts) {
    // @ts-ignore
    if (Contacts.RECORDS && Contacts.RECORDS.length > 0) {
      // @ts-ignore
      for (const contact of Contacts.RECORDS) {
        const newContact: ZContacts = ContactsCreateSchema.parse({
          role: contact.role,
          memberType: contact.member_type,
          fname: contact.fname,
          lname: contact.lname,
          nickname: contact.nickname,
          mname: contact.mname,
          prefix: contact.prefix,
          suffix: contact.suffix,
          title: contact.title,
          company: contact.company,
          bizAddress: contact.biz_address,
          bizCity: contact.biz_city,
          bizState: contact.biz_state,
          bizZip: contact.biz_zip,
          homeAddress: contact.home_address,
          homeCity: contact.home_city,
          homeState: contact.home_state,
          homeZip: contact.home_zip,
          accessCategory: contact.access_category
            ? [contact.access_category]
            : [],
          alternateBizCategory: contact.alternate_biz_category
            ? [contact.alternate_biz_category]
            : [],
          bizPhones: [contact.biz_phone, contact.biz_phone2].filter(Boolean),
          mobilePhones: [contact.mobile_phone].filter(Boolean),
          bizFax: [contact.biz_fax].filter(Boolean),
          homePhones: [contact.home_phone, contact.home_phone2].filter(Boolean),
          emails: [contact.email, contact.email2, contact.email3].filter(
            Boolean
          ),
          website: contact.website,
          referred: contact.referred,
          referredOther: contact.referred_other,
          accessMemberSince: contact.access_member_since
            ? safeParseDate(contact.access_member_since)
            : null,
          accessMembershipEnd: contact.access_membership_end
            ? safeParseDate(contact.access_membership_end)
            : null,
          notes: contact.notes,
          categories: contact.categories
            ? contact.categories.split(";").filter(Boolean)
            : [],
          companyDescription: contact.company_description,
          bizCountry: contact.biz_country,
          homeCountry: contact.home_country,
          websiteStatus: contact.website_status,
          anniversary: contact.anniversary,
          birthday: contact.birthday ? safeParseDate(contact.birthday) : null,
          dateCreated: contact.date_created
            ? safeParseDate(contact.date_created)
            : null,
          dateLastModified: contact.date_last_modified
            ? safeParseDate(contact.date_last_modified)
            : null,
          department: contact.department,
          otherFaxes: [contact.other_fax].filter(Boolean),
          gender: contact.gender,
          mailingCity: contact.mailing_city,
          mailingCountry: contact.mailing_country,
          mailingZip: contact.mailing_zip,
          mailingState: contact.mailing_state,
          mailingAddress: contact.mailing_address,
          otherCity: contact.other_city,
          otherCountry: contact.other_country,
          otherZip: contact.other_zip,
          otherState: contact.other_state,
          otherAddress: contact.other_address,
          otherPhones: [contact.other_phone].filter(Boolean),
          deleted: contact.deleted === "1" ? true : false,
          councilInterested: contact.council_interested,
          howCanWeHelp: contact.how_can_we_help,
          convicted: contact.convicted,
          convictedExplanation: contact.convicted_explanation,
          litigation: contact.litigation,
          litigationExplanation: contact.litigation_explanation,
          bankruptcy: contact.bankruptcy,
          bankruptcyExplanation: contact.bankruptcy_explanation,
          nfpReciprocation: contact.nfp_reciprocation,
          billingAddress: contact.billing_address,
          billingCity: contact.billing_city,
          billingState: contact.billing_state,
          billingZip: contact.billing_zip,
          signature: contact.signature,
          signatureDate: contact.signature_date
            ? safeParseDate(contact.signature_date)
            : null,
          timestamp: safeParseDate(contact.timestamp),
          idOrg: contact.id,
        });
        newContacts.push(newContact);
      }
    }
  }
  console.log(
    `Finished converting Contacts.json, created ${newContacts.length} new contacts`
  );
  return newContacts;
};

export const convertContactsCouncils = async (): Promise<
  ContactsCouncilsCreate[]
> => {
  console.log("Beginning to convert ContactsCouncils.json");
  const newContactsCouncils: ContactsCouncilsCreate[] = [];
  if (ContactsCouncils) {
    if (ContactsCouncils.RECORDS && ContactsCouncils.RECORDS.length > 0) {
      for (const contactCouncil of ContactsCouncils.RECORDS) {
        const newContactCouncil: ContactsCouncilsCreate =
          ContactsCouncilsCreateSchema.parse({
            memberId: contactCouncil.member_id.toString(),
            councilId: contactCouncil.council_id.toString(),
            memberCouncilsIdOrg: contactCouncil.member_councils_id.toString(),
            memberIdOrg: contactCouncil.member_id.toString(),
            councilIdOrg: contactCouncil.council_id.toString(),
          });
        newContactsCouncils.push(newContactCouncil);
      }
    }
  }
  console.log(
    `Finished converting ContactsCouncils.json, created ${newContactsCouncils.length} new contacts councils`
  );
  return newContactsCouncils;
};

export const convertCouncils = async (): Promise<ZCouncils[]> => {
  console.log("Beginning to convert Councils.json");
  const newCouncils: ZCouncils[] = []; // Assuming ZCouncils is the type that matches the schema
  if (Councils) {
    // Assuming Councils is the variable holding the JSON data
    for (const council of Councils.RECORDS) {
      const newCouncil: ZCouncils = CouncilsCreateSchema.parse({
        deleted: council.deleted === "1" ? true : false,
        regionId: council.region_id.toString(),
        council: council.council,
        leaderId: council.leader_id.toString(),
        meetingDescription: council.meeting_description,
        timeStart: council.time_start,
        timeEnd: council.time_end,
        contact: council.contact,
        contactEmail: council.contact_email,
        location: council.location,
        address: council.address,
        city: council.city,
        state: council.state,
        zip: council.zip,
        phone: council.phone ? [council.phone] : [],
        contactPhone: council.contact_phone ? [council.contact_phone] : [],
        description: council.description,
        homepage: council.homepage,
        alert: council.alert,
        timestamp: safeParseDate(council.timestamp),
        sponsored: council.sponsored,
        addInfo: council.add_info,
        currentOpenings: council.current_openings
          ? council.current_openings.split(",").map((s) => s.trim())
          : [],
        nextMeetings: council.next_meetings
          ? council.next_meetings
              .split(";")
              .map((dateStr) => safeParseDate(dateStr.trim()))
          : [],
        privateNote: council.private_note,
        idOrg: council.id.toString(),
        regionIdOrg: council.region_id.toString(), // Assuming this is the correct mapping
        leaderIdOrg: council.leader_id
          ? council.leader_id.toString()
          : undefined, // Assuming this is the correct mapping
      });
      newCouncils.push(newCouncil);
    }
  }
  console.log(
    `Finished converting Councils.json, created ${newCouncils.length} new councils`
  );
  return newCouncils;
};

export const convertDocuments = async (): Promise<ZDocuments[]> => {
  console.log("Beginning to convert Documents.json");
  const newDocuments: ZDocuments[] = [];
  if (Documents) {
    if (Documents.RECORDS && Documents.RECORDS.length > 0) {
      for (const doc of Documents.RECORDS) {
        const newDoc: ZDocuments = DocumentsCreateSchema.parse({
          uploadIdOrg: doc.uploadID,
          councilIdOrg: doc.council_id.toString(),
          filename: doc.filename,
          pathOrg: doc.path,
          urlOrg: doc.url,
          shortDescription: doc.shortDescription,
          longDescription: doc.longDescription,
          fileType: doc.fileType,
          uploadedBy: doc.uploadedBy,
          imageHeight: doc.imageHeight,
          imageWidth: doc.imageWidth,
          thumbnail: doc.thumbnail,
        });
        newDocuments.push(newDoc);
      }
    }
  }
  console.log(
    `Finished converting Documents.json, created ${newDocuments.length} new documents`
  );
  return newDocuments;
};

export const convertEvents = async (): Promise<ZEvents[]> => {
  console.log("Beginning to convert Events.json");
  const newEvents: ZEvents[] = [];
  if (Events) {
    if (Events.RECORDS && Events.RECORDS.length > 0) {
      for (const event of Events.RECORDS) {
        const newEvent: ZEvents = EventsCreateSchema.parse({
          eventType: event.event_type,
          councilId: event.council_id.toString(),
          submitter: event.submitter,
          submitterEmail: event.submitter_email,
          approved: event.approved === "1" ? true : false,
          approvedBy: event.approved_by
            ? event.approved_by.toString()
            : undefined,
          deleted: event.deleted === "1" ? true : false,
          timestamp: safeParseDate(event.timestamp),
          eventDate: event.event_date
            ? safeParseDate(event.event_date)
            : undefined,
          timeStart: event.time_start,
          timeEnd: event.time_end,
          eventName: event.event_name,
          meetingDescription: event.meeting_description,
          contact: event.contact,
          contactEmail: event.contact_email ? [event.contact_email] : [],
          location: event.location,
          address: event.address,
          city: event.city,
          state: event.state,
          zip: event.zip,
          phone: event.phone ? [event.phone] : [],
          contactPhone: event.contact_phone ? [event.contact_phone] : [],
          sponsored: event.sponsored,
          addInfo: event.add_info,
          ext: event.ext,
          contactExt: event.contact_ext,
          dayBeforeReminder:
            event.mailchimp_day_before_reminder_id === "1" ? true : false,
          weekBeforeReminder:
            event.mailchimp_week_before_reminder_id === "1" ? true : false,
          idOrg: event.id.toString(),
          councilIdOrg: event.council_id.toString(),
          approvedByOrg: event.approved_by
            ? event.approved_by.toString()
            : undefined,
          submitterOrg: event.submitter, // Assuming submitterOrg maps directly to submitter
          contactOrg: event.contact, // Assuming contactOrg maps directly to contact
        });
        newEvents.push(newEvent);
      }
    }
  }
  console.log(
    `Finished converting Events.json, created ${newEvents.length} new events`
  );
  return newEvents;
};

export const convertLinkCategories = async (): Promise<
  LinkCategoriesCreate[]
> => {
  console.log("Beginning to convert LinkCategories.json");
  const newLinkCategories: LinkCategoriesCreate[] = [];
  if (LinkCategoriesData && LinkCategoriesData.RECORDS) {
    for (const category of LinkCategoriesData.RECORDS) {
      const newCategory: LinkCategoriesCreate =
        LinkCategoriesCreateSchema.parse({
          category: category.category,
          parent: category.parent,
          idOrg: category.id.toString(),
          parentOrg: category.parent ? category.parent.toString() : undefined,
        });
      newLinkCategories.push(newCategory);
    }
  }
  console.log(
    `Finished converting LinkCategories.json, created ${newLinkCategories.length} new link categories`
  );
  return newLinkCategories;
};

export const convertLinks = async (): Promise<LinksCreate[]> => {
  console.log("Beginning to convert Links.json");
  const newLinks: LinksCreate[] = [];
  if (LinksData && LinksData.RECORDS) {
    for (const link of LinksData.RECORDS) {
      const newLink: LinksCreate = LinksCreateSchema.parse({
        approved: link.approved === "1" ? true : false,
        approvedBy: link.approved_by,
        deleted: link.deleted === "1" ? true : false,
        catId: link.cat_id.toString(),
        company: link.company,
        description: link.description,
        theirLink: link.their_link,
        link: link.link,
        submitter: link.submitter,
        submitterEmail: link.submitter_email,
        sort: link.sort,
        timestamp: safeParseDate(link.timestamp),
        approvedByOrg: link.approved_by
          ? link.approved_by.toString()
          : undefined,
        idOrg: link.id.toString(),
        catIdOrg: link.cat_id ? link.cat_id.toString() : undefined,
        submitterEmailOrg: link.submitter_email, // Assuming this is directly mapped
      });
      newLinks.push(newLink);
    }
  }
  console.log(
    `Finished converting Links.json, created ${newLinks.length} new links`
  );
  return newLinks;
};

export const convertRegions = async (): Promise<RegionsCreate[]> => {
  console.log("Beginning to convert Regions.json");
  const newRegions: RegionsCreate[] = [];
  if (RegionsData && RegionsData.RECORDS) {
    for (const region of RegionsData.RECORDS) {
      const newRegion: RegionsCreate = RegionsCreateSchema.parse({
        region: region.region,
        approved: region.approved === "1" ? true : false,
        idOrg: region.id.toString(),
      });
      newRegions.push(newRegion);
    }
  }
  console.log(
    `Finished converting Regions.json, created ${newRegions.length} new regions`
  );
  return newRegions;
};

export const convertTestimonials = async (): Promise<TestimonialsCreate[]> => {
  console.log("Beginning to convert Testimonials.json");
  const newTestimonials: TestimonialsCreate[] = [];
  if (TestimonialsData && TestimonialsData.RECORDS) {
    for (const testimonial of TestimonialsData.RECORDS) {
      const newTestimonial: TestimonialsCreate = TestimonialsCreateSchema.parse(
        {
          approved: testimonial.approved === "1" ? true : false,
          deleted: testimonial.deleted === "1" ? true : false,
          company: testimonial.company,
          name: testimonial.name,
          createdBy: testimonial.createdby, // Note the JSON field is "createdby", not "created_by"
          testimonial: testimonial.testimonial,
          sort: parseInt(testimonial.sort, 10), // Ensure "sort" is parsed as a number
          idOrg: testimonial.id.toString(),
        }
      );
      newTestimonials.push(newTestimonial);
    }
  }
  console.log(
    `Finished converting Testimonials.json, created ${newTestimonials.length} new testimonials`
  );
  return newTestimonials;
};
