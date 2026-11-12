import { useLanguage } from "@/lib/language-provider";
import { OrganizationPageGate } from "@/components/OrganizationPageGate";
import { useListOrganizations } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, Building2 } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function Organizations() {
  return <OrganizationPageGate requireOrganization={false}><OrganizationsContent /></OrganizationPageGate>;
}

function OrganizationsContent() {
  const { t, lang, dir } = useLanguage();
  const { data: orgs, isLoading } = useListOrganizations();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('orgs.title')}</h2>
          <p className="text-muted-foreground mt-1">
            {lang === 'ar' ? 'إدارة المنظمات والجمعيات التابعة' : 'Manage your associated organizations and charities'}
          </p>
        </div>
        <Link href="/organizations/new">
          <Button className="shadow-sm">
            <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
            {t('orgs.new')}
          </Button>
        </Link>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:left-auto rtl:right-3" />
            <Input 
              placeholder={lang === 'ar' ? 'بحث عن منظمة...' : 'Search organizations...'} 
              className="pl-9 rtl:pl-3 rtl:pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border/50">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[300px]">{lang === 'ar' ? 'اسم المنظمة' : 'Organization Name'}</TableHead>
                  <TableHead>{t('orgs.type')}</TableHead>
                  <TableHead>{t('orgs.city')}</TableHead>
                  <TableHead>{t('orgs.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-[200px]" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                    </TableRow>
                  ))
                ) : orgs && orgs.length > 0 ? (
                  orgs.map((org) => (
                    <TableRow key={org.id} className="hover:bg-muted/30 cursor-pointer">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span>{lang === 'ar' ? org.nameAr : org.nameEn}</span>
                            <span className="text-xs text-muted-foreground">{org.registrationNumber}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground capitalize">{org.type}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{org.city || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={org.status === 'ACTIVE' ? 'default' : 'secondary'} className={org.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20' : ''}>
                          {org.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      {t('common.noData')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
